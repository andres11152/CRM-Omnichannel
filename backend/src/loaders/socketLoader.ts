import { Server } from "http";
import { gateway } from "@/gateways/socketGateway";
import { EventBus } from "@/whatsapp/core/events/EventBus";
import { WhatsAppEventType } from "@/whatsapp/core/events/WhatsAppEvents";
import { TenantContextManager } from "@/config/tenantContext";

import { Logger } from "@/utils/logger";

/**
 *  Socket & Event Loader
 * Initializes WebSocket gateway and bridges domain events to sockets.
 */
export const initSocketGateway = async (httpServer: Server) => {
  Logger.info("[Loader]  Initializing Gateway...");
  await gateway.initialize(httpServer);
  Logger.info("[Loader] Gateway initialized successfully");

  // BRIDGE: WhatsApp Events -> Socket Gateway
  Logger.info("[Loader]  Bridging WhatsApp events to Socket Gateway...");
  const eventBus = EventBus.getInstance();

  eventBus.subscribe(WhatsAppEventType.SESSION_CONNECTED, (event) => {
    gateway.emitToCompany(event.companyId, "session.status", {
      sessionId: event.sessionId,
      status: "CONNECTED",
      phone: event.data.phone,
      timestamp: event.timestamp,
    });
  });

  eventBus.subscribe(WhatsAppEventType.SESSION_DISCONNECTED, (event) => {
    const isReconnecting = event.data?.isReconnecting;
    const status = isReconnecting ? "CONNECTING" : "DISCONNECTED";

    gateway.emitToCompany(event.companyId, "session.status", {
      sessionId: event.sessionId,
      status: status,
      reason: event.data?.reason,
      timestamp: event.timestamp,
    });

    if (isReconnecting) {
      Logger.info(
        `[Loader] [SYNC] Session ${event.sessionId} reconnecting... (UI: CONNECTING)`,
      );
    }
  });

  eventBus.subscribe(WhatsAppEventType.SESSION_QR_CODE, (event) => {
    gateway.emitToCompany(event.companyId, "qr.updated", {
      sessionId: event.sessionId,
      qr: event.data?.qr,
      timestamp: event.timestamp,
    });
  });

  eventBus.subscribe(WhatsAppEventType.SESSION_PAIRING_CODE, (event) => {
    gateway.emitToCompany(event.companyId, "pairing_code.updated", {
      sessionId: event.sessionId,
      code: event.data?.code,
      timestamp: event.timestamp,
    });
  });

  //  Legacy direct message propagation removed (Handled gracefully via SocketEventEmitter now)
  eventBus.subscribe(WhatsAppEventType.MESSAGE_RECEIVED, (_event) => {
    // We strictly use `socketEventEmitter.sendMessageReceived(...)` dynamically from chatService
    // instead of dumping raw Bailey's Protobuf objects onto the Redis Socket bridge which crashed it.
  });

  // [ONLINE] PRESENCE UPDATES (Typing indicators)
  eventBus.subscribe(WhatsAppEventType.PRESENCE_UPDATE, (event) => {
    try {
      const sanitized = JSON.parse(
        JSON.stringify({
          id: event.data.id,
          presences: event.data.presences,
        }),
      );
      gateway.emitToCompany(event.companyId, "presence.update", sanitized);
    } catch (err) {
      Logger.error(`[Loader] [ERROR] Failed to serialize presence for socket`, err);
    }
  });

  Logger.info("[Loader] Event Bridge established");

  // Status Sync on Connection
  const io = gateway.getIO();
  if (io) {
    io.on("connection", (socket) => {
      const user = socket.data.user;
      if (!user || !user.companyId) return;

      // [SEC] 100-YEAR FIX: Socket.IO event handlers run OUTSIDE the Express
      // request lifecycle, so the AsyncLocalStorage tenant context set up by
      // HTTP middleware never reaches here. Any Prisma query on a non-global
      // model (WhatsAppSession included) without an explicit tenant context
      // was throwing "SECURITY VIOLATION: Access to WhatsAppSession denied"
      // as an UNHANDLED REJECTION on every socket connection — the initial
      // session-status sync silently never ran. Wrap both handlers in
      // TenantContextManager.run() to set the context for this async chain.
      const tenantCtx = {
        companyId: user.companyId,
        userId: user.id,
        role: user.role,
        requestId: `socket:${socket.id}`,
      };

      TenantContextManager.run(tenantCtx, async () => {
        // [SYNC] Use Dynamic Import to avoid Circular Dependency OOM
        const { whatsappService } = await import("@/whatsapp");

        Logger.debug(
          `[Loader] [SYNC] Syncing session status for ${user.id} (Company: ${user.companyId})`,
        );

        // [FIX] Use listSessions which combines database records with current in-memory status
        const sessions = await whatsappService.listSessions(user.companyId);

        // Emit status for each session with phone included
        sessions.forEach((session) => {
          socket.emit("session.status", {
            sessionId: session.sessionId,
            status: session.status,
            phone: session.phone || null,
            timestamp: new Date(),
          });
        });
      }).catch((err) => {
        Logger.error(`[Loader] [SYNC] Failed to sync session status for ${user.id}:`, err);
      });

      // ⌨️ TYPING INDICATOR HANDLER moved to socketGateway.ts (Single Responsibility)
      // Eliminado código duplicado para evitar doble ejecución de eventos.

      // [SYNC] MANUAL STATUS CHECK HANDLER
      // Allows frontend to request immediate status update (e.g. on "Update Data" click)
      socket.on("session.check_status", () => {
        if (!user.companyId) return;

        TenantContextManager.run(tenantCtx, async () => {
          Logger.debug(
            `[Loader] [SYNC] Manual status check requested by ${user.id}`,
          );
          const { whatsappService } = await import("@/whatsapp");
          // Use listSessions for accurate current status
          const sessions = await whatsappService.listSessions(user.companyId);

          sessions.forEach((session) => {
            socket.emit("session.status", {
              sessionId: session.sessionId,
              status: session.status,
              phone: session.phone || null,
              timestamp: new Date(),
            });
          });
        }).catch((err) => {
          Logger.error(`[Loader] [SYNC] Manual status check failed for ${user.id}:`, err);
        });
      });
    });
  }
};
