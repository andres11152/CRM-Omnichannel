import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import { prisma } from "@/config/prisma";
import fs from "fs";
import path from "path";

class WhatsAppService {
  // Map sessionId -> socket
  private sessions: Map<string, any> = new Map();
  // Map sessionId -> QR Code (base64)
  private qrCodes: Map<string, string> = new Map();

  constructor() {
    // this.initialize(); // Removed to avoid unhandled rejection and double init
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
    const authPath = path.resolve(`baileys_auth_info/${sessionId}`);

    // Ensure parent directory exists
    const parentDir = path.dirname(authPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    try {
      const { state, saveCreds } = await useMultiFileAuthState(authPath);

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ["Reply CRM", "Chrome", "1.0.0"],
      });

      this.sessions.set(sessionId, sock);

      sock.ev.on("connection.update", async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            const qrImage = await QRCode.toDataURL(qr);
            this.qrCodes.set(sessionId, qrImage);
            await prisma.whatsAppSession.update({
              where: { sessionId },
              data: { qrCode: qrImage, status: "SCANNING" },
            });
            console.log(`[WhatsApp] QR Code received for ${sessionId}`);
          } catch (err) {
            console.error(`[WhatsApp] QR Gen Error: ${err}`);
          }
        }

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
            this.initializeSession(sessionId);
          } else {
            // Logged out
            console.log(
              `[WhatsApp] Session ${sessionId} logged out. Cleaning up...`
            );
            this.qrCodes.delete(sessionId);
            try {
              // Try to update status to DISCONNECTED, but ignore if record is already deleted
              await prisma.whatsAppSession.update({
                where: { sessionId },
                data: { status: "DISCONNECTED", qrCode: null },
              });
            } catch (e) {
              console.warn(
                `[WhatsApp] Could not update session status (might be deleted): ${e}`
              );
            }
            await this.deleteSessionFiles(sessionId);
          }
        } else if (connection === "open") {
          console.log(`[WhatsApp] Session ${sessionId} OPEN! 🚀`);
          this.qrCodes.delete(sessionId);

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
        }
      });

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("messages.upsert", async (m: any) => {
        this.handleIncomingMessage(sessionId, m);
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
        include: { company: true },
      });

      if (!sessionRecord) {
        console.error(`[WhatsApp] Session record not found for ${sessionId}`);
        return;
      }

      const companyId = sessionRecord.companyId;
      let phone = remoteJid.split("@")[0];

      // FIX: Map specific Danish number to Colombian number
      if (phone === "45908938997905") {
        console.log("[WhatsApp] Remapping Danish number 45... to 573242450628");
        phone = "573242450628";
      }

      const email = `${phone}@whatsapp.user`;
      // Use pushName from WhatsApp, or a professional default name
      const contactName =
        msg.pushName && msg.pushName !== phone
          ? msg.pushName
          : `Usuario WhatsApp`;

      // Find or Create User (The Customer/Contact)
      let customerUser = await prisma.user.findUnique({ where: { email } });
      if (!customerUser) {
        customerUser = await prisma.user.create({
          data: {
            email,
            name: contactName,
            password: await import("bcryptjs").then((b) =>
              b.hash("123456", 10)
            ),
            role: "USER",
            companyId: companyId,
          },
        });

        // Also create a Contact entry with proper phone number
        try {
          await prisma.contact.create({
            data: {
              companyId: companyId,
              name: contactName,
              email: email,
              phone: phone, // This is where the phone number belongs
              notes: `Auto-creado desde WhatsApp`,
              tags: ["whatsapp"],
            },
          });
          console.log(
            `[WhatsApp] Created Contact entry for ${contactName} with phone ${phone}`
          );
        } catch (err) {
          console.log(`[WhatsApp] Contact might already exist or error:`, err);
        }
      }

      // Determine Sender ID
      let senderId = customerUser.id;
      let senderName = customerUser.name;
      let senderType = "USER";

      if (isOutbound) {
        // If message is from ME (Mobile), assign to a "Mobile Agent" user
        const mobileEmail = `mobile_${companyId}@reply.com`;
        let mobileUser = await prisma.user.findUnique({
          where: { email: mobileEmail },
        });

        if (!mobileUser) {
          mobileUser = await prisma.user.create({
            data: {
              email: mobileEmail,
              name: "Desde Celular",
              password: await import("bcryptjs").then((b) =>
                b.hash("123456", 10)
              ),
              role: "AGENT",
              companyId: companyId,
            },
          });
        }
        senderId = mobileUser.id;
        senderName = mobileUser.name;
        senderType = "AGENT";
      }

      // Find or Create Conversation
      // 1. Try to find an OPEN conversation for this contact first (to avoid duplicates)
      let conversation = await prisma.conversation.findFirst({
        where: {
          companyId: companyId,
          status: "OPEN",
          participants: { some: { id: customerUser.id } },
        },
      });

      // 2. If no OPEN conversation, check for ANY conversation (legacy fallback)
      if (!conversation) {
        conversation = await prisma.conversation.findFirst({
          where: {
            companyId: companyId,
            participants: { some: { id: customerUser.id } },
            OR: [
              { channelId: sessionRecord.phone },
              { channelId: sessionId },
              { channelId: null },
            ],
          },
          orderBy: { updatedAt: "desc" }, // Get the most recent one
        });

        // If we found a CLOSED one, we might want to REOPEN it or Create NEW.
        // For now, let's reuse it and set to OPEN if it was closed?
        // Or better: if it's closed, create a NEW one to start fresh session?
        // User request implies they want to avoid duplicates, so reusing might be better OR
        // ensuring the UI groups them.
        // Let's stick to: If found (even closed), reuse it.
        if (conversation && conversation.status !== "OPEN") {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { status: "OPEN" },
          });
          conversation.status = "OPEN";
        }
      }

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            companyId: companyId,
            channelId: sessionRecord.phone || sessionId,
            subject: `WhatsApp: ${contactName}`,
            status: "OPEN",
            participants: { connect: [{ id: customerUser.id }] },
          },
        });
      } else {
        // Update channelId if it was null
        if (!conversation.channelId) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { channelId: sessionRecord.phone || sessionId },
          });
        }
      }

      // Create Message
      const newMessage = await prisma.message.create({
        data: {
          content: text,
          channel: "WHATSAPP",
          direction: isOutbound ? "OUTBOUND" : "INBOUND",
          conversationId: conversation.id,
          senderId: senderId,
        },
      });

      // Emit Socket
      const io = (await import("@/gateways/socketGateway")).gateway.getIO();
      io?.emit("message", {
        ...newMessage,
        ticketId: conversation.id,
        senderName: senderName,
        senderType: senderType,
      });

      // --- SYNC QUEUE ID FALLBACK ---
      if (!conversation.queueId) {
        const ticket = await prisma.ticket.findFirst({
          where: { conversationId: conversation.id, status: "OPEN" },
          orderBy: { createdAt: "desc" },
        });
        if (ticket && ticket.queueId) {
          console.log(
            `[AI Fix] Found linked ticket with queueId ${ticket.queueId}. Syncing...`
          );
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { queueId: ticket.queueId },
          });
          conversation.queueId = ticket.queueId;
        }
      }

      // --- AI AUTO-RESPONSE ---
      // ONLY trigger AI if message is INBOUND (from customer)
      if (conversation.queueId && !isOutbound) {
        try {
          const queue = await prisma.queue.findUnique({
            where: { id: conversation.queueId },
            include: { aiAssistant: true },
          });

          if (queue?.aiAssistant) {
            console.log(
              `[AI] Queue has assistant: ${queue.aiAssistant.name}. Generating response...`
            );

            // Get history (last 10 messages)
            const historyMessages = await prisma.message.findMany({
              where: { conversationId: conversation.id },
              orderBy: { createdAt: "desc" },
              take: 10,
              skip: 1, // Skip the current message we just added
            });

            const history = historyMessages.reverse().map((m: any) => ({
              role: (m.senderId === customerUser.id ? "user" : "model") as
                | "user"
                | "model",
              parts: m.content,
            }));

            const { generateAIResponse } = await import("./aiResponseService");
            const aiResponse = await generateAIResponse(
              companyId,
              queue.aiAssistant.id,
              text,
              history
            );

            if (aiResponse) {
              console.log(`[AI] Response generated: ${aiResponse}`);

              // Send via WhatsApp
              await this.sendMessage(
                remoteJid,
                aiResponse,
                conversation.channelId || undefined
              );

              // Find or Create Bot User
              let botSender = await prisma.user.findFirst({
                where: { email: `bot_${companyId}@reply.com` },
              });
              if (!botSender) {
                botSender = await prisma.user.create({
                  data: {
                    email: `bot_${companyId}@reply.com`,
                    name: queue.aiAssistant.name || "AI Assistant",
                    password: "bot", // Dummy
                    role: "AGENT",
                    companyId,
                  },
                });
              }

              // Save to DB
              const responseMsg = await prisma.message.create({
                data: {
                  content: aiResponse,
                  channel: "WHATSAPP",
                  direction: "OUTBOUND",
                  conversationId: conversation.id,
                  senderId: botSender.id,
                },
              });

              // Emit socket for the AI response
              io?.emit("message", {
                ...responseMsg,
                ticketId: conversation.id,
                senderName: botSender.name,
                senderType: "BOT",
              });
            }
          }
        } catch (aiError) {
          console.error("[AI] Error in auto-response loop:", aiError);
        }
      }
      // -----------------------
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
      // Try to find session by phone (channelId) or sessionId
      // We need to look up which sessionId corresponds to this phone
      const session = await prisma.whatsAppSession.findFirst({
        where: {
          OR: [{ phone: channelId }, { sessionId: channelId }],
          status: "CONNECTED",
        },
      });
      if (session && this.sessions.has(session.sessionId)) {
        sock = this.sessions.get(session.sessionId);
        usedSessionId = session.sessionId;
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

      console.log(`[WhatsApp] Deleting files for ${sessionId}...`);
      await this.deleteSessionFiles(sessionId);

      console.log(`[WhatsApp] Deleting DB record for ${sessionId}...`);
      await prisma.whatsAppSession.delete({ where: { sessionId } });
      console.log(`[WhatsApp] Session ${sessionId} deleted successfully.`);
    } catch (error) {
      console.error(`[WhatsApp] Error deleting session ${sessionId}:`, error);
      throw error;
    }
  }

  private async deleteSessionFiles(sessionId: string) {
    const sessionPath = path.resolve(`baileys_auth_info/${sessionId}`);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
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
