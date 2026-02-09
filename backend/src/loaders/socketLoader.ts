import { Server } from "http";
import { gateway } from "@/gateways/socketGateway";
import { EventBus } from "@/whatsapp/core/events/EventBus";
import { WhatsAppEventType } from "@/whatsapp/core/events/WhatsAppEvents";

import { Logger } from "@/utils/logger";

/**
 * 🏭 Socket & Event Loader
 * Initializes WebSocket gateway and bridges domain events to sockets.
 */
export const initSocketGateway = async (httpServer: Server) => {
  Logger.info("[Loader] 🔧 Initializing Gateway...");
  await gateway.initialize(httpServer);
  Logger.info("[Loader] ✅ Gateway initialized successfully");

  // BRIDGE: WhatsApp Events -> Socket Gateway
  Logger.info("[Loader] 🌉 Bridging WhatsApp events to Socket Gateway...");
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
        `[Loader] 🔄 Session ${event.sessionId} reconnecting... (UI: CONNECTING)`,
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

  // 🔥 Propagate incoming messages to frontend in REAL-TIME
  eventBus.subscribe(WhatsAppEventType.MESSAGE_RECEIVED, (event) => {
    Logger.debug(
      `[Loader] 📨 Propagating message to company ${event.companyId}`,
    );
    gateway.emitToCompany(event.companyId, "message.received", {
      message: event.data.message,
      timestamp: event.timestamp,
    });
  });

  // 🟢 PRESENCE UPDATES (Typing indicators)
  eventBus.subscribe(WhatsAppEventType.PRESENCE_UPDATE, (event) => {
    gateway.emitToCompany(event.companyId, "presence.update", {
      id: event.data.id,
      presences: event.data.presences,
    });
  });

  Logger.info("[Loader] ✅ Event Bridge established");

  // Status Sync on Connection
  const io = gateway.getIO();
  if (io) {
    io.on("connection", async (socket) => {
      const user = socket.data.user;
      if (user && user.companyId) {
        // 🔄 Use Dynamic Import to avoid Circular Dependency OOM
        const { whatsappService } = await import("@/whatsapp");

        Logger.debug(
          `[Loader] 🔄 Syncing session status for ${user.id} (Company: ${user.companyId})`,
        );

        // Fetch status from Service (Memory First)
        const sessions = await whatsappService.listSessions(user.companyId);

        // Emit status for each session
        sessions.forEach((session) => {
          socket.emit("session.status", {
            sessionId: session.sessionId,
            status: session.status,
            timestamp: new Date(),
          });
        });

        // ⌨️ TYPING INDICATOR HANDLER moved to socketGateway.ts (Single Responsibility)
        // Eliminado código duplicado para evitar doble ejecución de eventos.

        // 🔄 MANUAL STATUS CHECK HANDLER
        // Allows frontend to request immediate status update (e.g. on "Update Data" click)
        socket.on("session.check_status", async () => {
          if (!user.companyId) return;

          Logger.debug(
            `[Loader] 🔄 Manual status check requested by ${user.id}`,
          );
          const { whatsappService } = await import("@/whatsapp");
          const sessions = await whatsappService.listSessions(user.companyId);

          sessions.forEach((session) => {
            socket.emit("session.status", {
              sessionId: session.sessionId,
              status: session.status,
              timestamp: new Date(),
            });
          });
        });
      }
    });
  }
};
