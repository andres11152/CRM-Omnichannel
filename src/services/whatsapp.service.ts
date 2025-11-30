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
    const sessions = await (prisma as any).whatsAppSession.findMany();
    for (const session of sessions) {
      await this.initializeSession(session.sessionId);
    }
  }

  async createSession(companyId: string) {
    console.log(`[WhatsApp] Creating new session for company ${companyId}`);
    try {
      const session = await (prisma as any).whatsAppSession.create({
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
            await (prisma as any).whatsAppSession.update({
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
              await (prisma as any).whatsAppSession.update({
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

          await (prisma as any).whatsAppSession.update({
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
      if (!msg.message || msg.key.fromMe) return;

      const remoteJid = msg.key.remoteJid;
      const text =
        msg.message.conversation || msg.message.extendedTextMessage?.text;

      if (!remoteJid || !text) return;

      console.log(`[WhatsApp] [${sessionId}] Msg from ${remoteJid}: ${text}`);

      // Find the session record to get companyId
      const sessionRecord = await (prisma as any).whatsAppSession.findUnique({
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
      const pushName = msg.pushName || phone;

      // Find or Create User
      let contact = await prisma.user.findUnique({ where: { email } });
      if (!contact) {
        contact = await prisma.user.create({
          data: {
            email,
            name: pushName,
            password: await import("bcryptjs").then((b) =>
              b.hash("123456", 10)
            ),
            role: "USER",
            companyId: companyId,
          },
        });
      }

      // Find or Create Conversation
      // We link conversation to the specific channel (sessionId/phone)
      let conversation = await (prisma as any).conversation.findFirst({
        where: {
          companyId: companyId,
          channelId: sessionRecord.phone || sessionId, // Link to this specific bot number
          participants: { some: { id: contact.id } },
        },
      });

      if (!conversation) {
        // Fallback: Check if there's an open conversation without channelId or matching this user
        // to avoid duplicates if we just switched architectures
        conversation = await (prisma as any).conversation.findFirst({
          where: {
            companyId: companyId,
            participants: { some: { id: contact.id } },
            // If we want to be strict, we only match if channelId is null or matches
            // OR: we just create a new one if channelId doesn't match?
            // Let's try to reuse if channelId is null (legacy)
            OR: [
              { channelId: sessionRecord.phone },
              { channelId: sessionId },
              { channelId: null },
            ],
          },
        });
      }

      if (!conversation) {
        conversation = await (prisma as any).conversation.create({
          data: {
            companyId: companyId,
            channelId: sessionRecord.phone || sessionId,
            subject: `WhatsApp: ${pushName}`,
            status: "OPEN",
            participants: { connect: [{ id: contact.id }] },
          },
        });
      } else {
        // Update channelId if it was null
        if (!conversation.channelId) {
          await (prisma as any).conversation.update({
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
          direction: "INBOUND",
          conversationId: conversation.id,
          senderId: contact.id,
        },
      });

      // Emit Socket
      const io = (await import("@/gateways/socketGateway")).gateway.getIO();
      io?.emit("message", {
        ...newMessage,
        ticketId: conversation.id,
        senderName: contact.name,
        senderType: "USER",
      });
    } catch (error) {
      console.error(`[WhatsApp] Error processing message: ${error}`);
    }
  }

  async sendMessage(to: string, text: string, channelId?: string) {
    // We need to find the right session.
    // If channelId is provided (e.g. from conversation), use it.
    // Otherwise, try to find ANY connected session.

    let sock;
    let usedSessionId;

    if (channelId) {
      // Try to find session by phone (channelId) or sessionId
      // We need to look up which sessionId corresponds to this phone
      const session = await (prisma as any).whatsAppSession.findFirst({
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
      await sock.sendMessage(jid, { text });
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
      await (prisma as any).whatsAppSession.delete({ where: { sessionId } });
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
    const session = await (prisma as any).whatsAppSession.findUnique({
      where: { sessionId },
    });
    return session;
  }

  async listSessions(companyId: string) {
    console.log(`[WhatsApp] Listing sessions for company ${companyId}`);
    try {
      const sessions = await (prisma as any).whatsAppSession.findMany({
        where: { companyId },
      });
      console.log(`[WhatsApp] Found ${sessions.length} sessions.`);
      return sessions;
    } catch (error) {
      console.error(`[WhatsApp] Error listing sessions:`, error);
      throw error;
    }
  }
}

export const whatsappService = new WhatsAppService();
