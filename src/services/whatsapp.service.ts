import makeWASocket, { DisconnectReason } from "@whiskeysockets/baileys";
import { usePrismaAuthState } from "./baileysAuth";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import { prisma } from "@/config/prisma";

class WhatsAppService {
  // Map sessionId -> socket
  private sessions: Map<string, any> = new Map();
  // Map sessionId -> QR Code (base64)
  private qrCodes: Map<string, string> = new Map();
  // Map sessionId -> attempts count
  private reconnectAttempts: Map<string, number> = new Map();

  constructor() {
    // Session loader moved to initialize()
  }

  // Load all active sessions from DB on startup
  async initialize() {
    console.log("[WhatsApp] Initializing all sessions...");
    const sessions = await prisma.whatsAppSession.findMany();
    for (const session of sessions) {
      await this.initializeSession(session.sessionId);
    }
  }

  async createSession(companyId: string) {
    console.log(`[WhatsApp] Creating new session for company ${companyId}`);
    try {
      const session = await prisma.whatsAppSession.create({
        data: {
          companyId,
          sessionId: `session_${companyId}_${Date.now()}`,
          status: "SCANNING",
        },
      });
      console.log(`[WhatsApp] DB record created: ${session.sessionId}`);
      this.initializeSession(session.sessionId);
      return session;
    } catch (error) {
      console.error(`[WhatsApp] Error creating session:`, error);
      throw error;
    }
  }

  async initializeSession(sessionId: string) {
    if (this.sessions.has(sessionId)) {
      console.log(`[WhatsApp] Session ${sessionId} already active.`);
      return;
    }

    console.log(`[WhatsApp] Initializing session: ${sessionId}`);

    // DB Auth - No file paths needed
    try {
      const { state, saveCreds } = await usePrismaAuthState(sessionId);

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ["Reply CRM", "Chrome", "1.0.0"],
      });

      this.sessions.set(sessionId, sock);

      sock.ev.on("connection.update", async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        // --- REAL TIMELINE QR ---
        if (qr) {
          try {
            const qrImage = await QRCode.toDataURL(qr);
            this.qrCodes.set(sessionId, qrImage);
            await prisma.whatsAppSession.update({
              where: { sessionId },
              data: { qrCode: qrImage, status: "SCANNING" },
            });
            console.log(`[WhatsApp] QR Code received for ${sessionId}`);

            // Emit Socket Event
            try {
              const { gateway } = await import("@/gateways/socketGateway");
              gateway.getIO()?.emit("qr.updated", { sessionId, qr: qrImage });
            } catch (ignore) {}
          } catch (err) {
            console.error(`[WhatsApp] QR Gen Error: ${err}`);
          }
        }

        // --- CONNECTION STATUS ---
        if (connection === "close") {
          const shouldReconnect =
            (lastDisconnect?.error as any)?.output?.statusCode !==
            DisconnectReason.loggedOut;

          console.log(
            `[WhatsApp] Session ${sessionId} closed. Reconnect: ${shouldReconnect}`
          );

          // Always remove the closed socket from the map
          this.sessions.delete(sessionId);

          if (shouldReconnect) {
            // --- EXPONENTIAL BACKOFF ---
            const attempts = this.reconnectAttempts.get(sessionId) || 0;
            const delay = Math.min(1000 * Math.pow(2, attempts), 60000); // Max 60s
            this.reconnectAttempts.set(sessionId, attempts + 1);

            console.log(
              `[WhatsApp] Reconnecting session ${sessionId} in ${delay}ms (Attempt ${
                attempts + 1
              })...`
            );

            // Notify Frontend
            try {
              const { gateway } = await import("@/gateways/socketGateway");
              gateway.getIO()?.emit("session.status", {
                sessionId,
                status: "RECONNECTING",
                attempt: attempts + 1,
                nextAttemptIn: delay,
              });
            } catch (ignore) {}

            // Dispatch Webhook
            try {
              const session = await prisma.whatsAppSession.findUnique({
                where: { sessionId },
              });
              if (session) {
                const { webhookDispatcher } = await import(
                  "@/services/webhookDispatcher"
                );
                await webhookDispatcher.trigger(
                  session.companyId,
                  "system.reconnecting",
                  {
                    sessionId,
                    attempt: attempts + 1,
                    nextAttemptIn: delay,
                    timestamp: new Date(),
                  }
                );
              }
            } catch (webhookErr) {
              console.warn("[WhatsApp] Webhook dispatch failed:", webhookErr);
            }

            setTimeout(() => this.initializeSession(sessionId), delay);
          } else {
            // Logged out
            console.log(
              `[WhatsApp] Session ${sessionId} logged out. Cleaning up...`
            );
            this.qrCodes.delete(sessionId);
            this.reconnectAttempts.delete(sessionId);

            try {
              // Try to update status to DISCONNECTED
              await prisma.whatsAppSession.update({
                where: { sessionId },
                data: { status: "DISCONNECTED", qrCode: null },
              });

              // Notify Frontend
              try {
                const { gateway } = await import("@/gateways/socketGateway");
                gateway.getIO()?.emit("session.status", {
                  sessionId,
                  status: "DISCONNECTED",
                  reason: "LOGGED_OUT",
                });
                gateway.getIO()?.emit("system.event", {
                  type: "DEVICE_DISCONNECTED",
                  sessionId,
                });
              } catch (ignore) {}

              // Dispatch Webhook for external integrations
              try {
                const session = await prisma.whatsAppSession.findUnique({
                  where: { sessionId },
                });
                if (session) {
                  const { webhookDispatcher } = await import(
                    "@/services/webhookDispatcher"
                  );
                  await webhookDispatcher.trigger(
                    session.companyId,
                    "system.device_disconnected",
                    {
                      sessionId,
                      phone: session.phone,
                      reason: "LOGGED_OUT",
                      timestamp: new Date(),
                    }
                  );
                }
              } catch (webhookErr) {
                console.warn("[WhatsApp] Webhook dispatch failed:", webhookErr);
              }
            } catch (e) {
              console.warn(
                `[WhatsApp] Could not update session status (might be deleted): ${e}`
              );
            }
            // Clean up credentials from DB on logout
            try {
              await prisma.whatsAppCredential.deleteMany({
                where: { sessionId },
              });
              await prisma.whatsAppSession.delete({ where: { sessionId } });
            } catch (err) {
              console.error(
                `[WhatsApp] Error cleaning up session ${sessionId}:`,
                err
              );
            }
          }
        } else if (connection === "open") {
          console.log(`[WhatsApp] Session ${sessionId} OPEN! 🚀`);
          this.qrCodes.delete(sessionId);
          this.reconnectAttempts.delete(sessionId);

          const user = sock.user;
          const phone = user?.id?.split(":")[0];

          await prisma.whatsAppSession.update({
            where: { sessionId },
            data: {
              status: "CONNECTED",
              qrCode: null,
              phone: phone,
            },
          });

          // Notify Frontend
          try {
            const { gateway } = await import("@/gateways/socketGateway");
            gateway.getIO()?.emit("session.status", {
              sessionId,
              status: "CONNECTED",
              phone,
            });
            gateway.getIO()?.emit("system.event", {
              type: "CONNECTION_RESTORED",
              sessionId,
            });
          } catch (ignore) {}
        }
      });

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("messages.upsert", async (m: any) => {
        // console.log(`[WhatsApp] Messages upsert: ${m.messages.length} messages, type: ${m.type}`);
        // Handle all messages, not just the first one
        for (const msg of m.messages) {
          await this.handleIncomingMessage(sessionId, {
            messages: [msg],
            type: m.type,
          });
        }
      });
    } catch (error) {
      console.error(`[WhatsApp] Init failed for ${sessionId}:`, error);
    }
  }

  private async handleIncomingMessage(sessionId: string, m: any) {
    try {
      const msg = m.messages[0];
      if (!msg.message) return; // Allow fromMe messages

      const remoteJid = msg.key.remoteJid;
      const isOutbound = msg.key.fromMe;
      const text =
        msg.message.conversation || msg.message.extendedTextMessage?.text;

      if (!remoteJid || !text) return;

      console.log(
        `[WhatsApp] [${sessionId}] Msg ${
          isOutbound ? "TO" : "FROM"
        } ${remoteJid}: ${text}`
      );

      // Find the session record to get companyId
      const sessionRecord = await prisma.whatsAppSession.findUnique({
        where: { sessionId },
      });

      if (!sessionRecord) {
        console.warn(`[WhatsApp] Session record not found for ${sessionId}`);
        return;
      }

      // IMPORT DYNAMICALLY TO AVOID CIRCULAR DEPENDENCY ISSUES
      const { messageProcessor } = await import("./messageProcessor.service");

      await messageProcessor.process({
        companyId: sessionRecord.companyId,
        sessionId,
        remoteJid,
        text,
        isOutbound: !!isOutbound,
        contactName: msg.pushName || undefined,
        senderName: isOutbound ? "Me" : undefined,
      });

      // LOGIC DELEGATED TO messageProcessor.service.ts
      return;

      /* OLD LOGIC REMOVED FOR CLEAN ARCHITECTURE */
    } catch (error) {
      console.error(`[WhatsApp] Error processing message: ${error}`);
    }
  }

  async sendMessage(
    to: string,
    text: string,
    channelId?: string,
    media?: {
      url: string;
      type: "image" | "video" | "document";
      caption?: string;
    }
  ) {
    // We need to find the right session.
    // If channelId is provided (e.g. from conversation), use it.
    // Otherwise, try to find ANY connected session.

    let sock;
    let usedSessionId;

    if (channelId) {
      try {
        // Try to find session by phone (channelId) or sessionId
        // We need to look up which sessionId corresponds to this phone
        const session = await prisma.whatsAppSession.findFirst({
          where: {
            OR: [{ phone: channelId }, { sessionId: channelId }],
            status: "CONNECTED",
          },
        });
        if (
          session &&
          session.sessionId &&
          this.sessions.has(session.sessionId)
        ) {
          sock = this.sessions.get(session.sessionId);
          usedSessionId = session.sessionId;
          console.log(
            `[WhatsApp] Found session for channel ${channelId}: ${usedSessionId}`
          );
        }
      } catch (error) {
        console.warn(
          `[WhatsApp] Error finding session for channel ${channelId}:`,
          error
        );
      }
    }

    if (!sock) {
      // Fallback: Use the first connected session we have
      console.warn(
        `[WhatsApp] No specific session found for channel ${channelId}, using fallback.`
      );
      for (const [id, s] of this.sessions.entries()) {
        sock = s;
        usedSessionId = id;
        console.log(`[WhatsApp] Using fallback session: ${id}`);
        break;
      }
    }

    if (!sock) {
      console.error("[WhatsApp] No active sessions available!");
      return false;
    }

    try {
      console.log(`[WhatsApp] Sending via session ${usedSessionId} to ${to}`);
      const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;

      if (media) {
        console.log(`[WhatsApp] Sending media: ${media.type}`);
        if (media.type === "image") {
          await sock.sendMessage(jid, {
            image: { url: media.url },
            caption: text || media.caption,
          });
        } else if (media.type === "video") {
          await sock.sendMessage(jid, {
            video: { url: media.url },
            caption: text || media.caption,
          });
        } else {
          await sock.sendMessage(jid, {
            document: { url: media.url },
            caption: text || media.caption,
          });
        }
      } else {
        await sock.sendMessage(jid, { text });
      }
      return true;
    } catch (error) {
      console.error(`[WhatsApp] Send failed: ${error}`);
      return false;
    }
  }

  async deleteSession(sessionId: string) {
    console.log(`[WhatsApp] Deleting session ${sessionId}...`);
    try {
      const sock = this.sessions.get(sessionId);
      if (sock) {
        console.log(`[WhatsApp] Logging out socket for ${sessionId}...`);
        try {
          await sock.logout();
        } catch (e) {
          console.warn(`[WhatsApp] Logout failed (ignoring): ${e}`);
        }
        this.sessions.delete(sessionId);
      }
      this.qrCodes.delete(sessionId);

      console.log(`[WhatsApp] Deleting session credentials from DB...`);
      // Credentials are cascade deleted? No, we need to delete them manually or rely on cascading if sessionId was a foreign key.
      // In our schema, WhatsAppCredential relates to a string sessionId, not a foreign key constraint to WhatsAppSession necessarily.
      // So we should delete them.
      await prisma.whatsAppCredential.deleteMany({
        where: { sessionId },
      });

      console.log(`[WhatsApp] Deleting DB record for ${sessionId}...`);
      await prisma.whatsAppSession.delete({ where: { sessionId } });
      console.log(`[WhatsApp] Session ${sessionId} deleted successfully.`);
    } catch (error) {
      console.error(`[WhatsApp] Error deleting session ${sessionId}:`, error);
      throw error;
    }
  }

  // Helper for frontend to get QR
  async getSessionStatus(sessionId: string) {
    const session = await prisma.whatsAppSession.findUnique({
      where: { sessionId },
    });
    return session;
  }

  async listSessions(companyId: string) {
    console.log(`[WhatsApp] Listing sessions for company ${companyId}`);
    try {
      const sessions = await prisma.whatsAppSession.findMany({
        where: { companyId },
      });
      console.log(`[WhatsApp] Found ${sessions.length} sessions.`);
      return sessions;
    } catch (error) {
      console.error(`[WhatsApp] Error listing sessions:`, error);
      throw error;
    }
  }

  async syncMessages(companyId: string, fromDate: Date) {
    console.log(
      `[WhatsApp] Syncing messages for company ${companyId} from ${fromDate}`
    );
    try {
      const conversations = await prisma.conversation.findMany({
        where: {
          companyId,
          channelId: { not: null },
        },
      });

      const session = await prisma.whatsAppSession.findFirst({
        where: { companyId, status: "CONNECTED" },
      });

      if (!session || !this.sessions.has(session.sessionId)) {
        throw new Error(
          "No connected WhatsApp session found for this company."
        );
      }

      const sock = this.sessions.get(session.sessionId);
      let totalSynced = 0;

      for (const conv of conversations) {
        if (!conv.channelId) continue;
        try {
          const jid = conv.channelId.includes("@")
            ? conv.channelId
            : `${conv.channelId}@s.whatsapp.net`;

          // Check if method exists (it likely doesn't in standard Baileys without a store/plugin)
          if (typeof (sock as any).fetchMessagesFromWA !== "function") {
            console.warn(
              `[WhatsApp] fetchMessagesFromWA not available on socket. Skipping sync for ${jid}`
            );
            continue;
          }

          // Using any cast to bypass TS error as discussed
          const messages = await (sock as any).fetchMessagesFromWA(jid, 50);
          if (!messages) continue;

          for (const msg of messages) {
            const msgTime = (msg.messageTimestamp as number) * 1000;
            if (new Date(msgTime) < fromDate) continue;

            const content =
              msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text;
            if (!content) continue;

            const exists = await prisma.message.findFirst({
              where: {
                conversationId: conv.id,
                content: content,
                createdAt: {
                  gte: new Date(msgTime - 2000),
                  lte: new Date(msgTime + 2000),
                },
              },
            });

            if (exists) continue;

            await this.handleIncomingMessage(session.sessionId, {
              messages: [msg],
              type: "notify",
            });
            totalSynced++;
          }
        } catch (err) {
          console.error(
            `[WhatsApp] Error syncing chat ${conv.channelId}:`,
            err
          );
        }
      }
      return { synced: totalSynced };
    } catch (error) {
      console.error(`[WhatsApp] Error syncing messages:`, error);
      throw error;
    }
  }
}

export const whatsappService = new WhatsAppService();
