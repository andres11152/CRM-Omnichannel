import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { Logger } from "@/utils/logger";
import qrcodeTerminal from "qrcode-terminal";
import QRCode from "qrcode";
import { prisma } from "@/config/prisma";
import fs from "fs";
import path from "path";

class WhatsAppService {
  private sock: any;
  private connectionState: "connecting" | "open" | "close" = "close";
  private qrCode?: string;

  async initialize() {
    if (
      this.connectionState === "open" ||
      this.connectionState === "connecting"
    ) {
      console.log("[WhatsApp] Connection already open or connecting.");
      return;
    }

    this.connectionState = "connecting";
    console.log("[WhatsApp] Initializing connection...");

    try {
      const { state, saveCreds } = await useMultiFileAuthState(
        "baileys_auth_info"
      );

      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
      });

      this.sock.ev.on("connection.update", async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            this.qrCode = await QRCode.toDataURL(qr);
            console.log("[WhatsApp] QR Code received");
          } catch (err) {
            console.error(
              `[WhatsApp] Failed to generate QR code image: ${err}`
            );
          }
        }

        if (connection === "close") {
          this.connectionState = "close";
          const shouldReconnect =
            (lastDisconnect?.error as Boom)?.output?.statusCode !==
            DisconnectReason.loggedOut;
          console.error(
            `[WhatsApp] Connection closed: ${lastDisconnect?.error}, reconnecting: ${shouldReconnect}`
          );

          if (shouldReconnect) {
            this.initialize().catch((err) =>
              console.error(`[WhatsApp] Re-init failed: ${err}`)
            );
          }
        } else if (connection === "open") {
          this.connectionState = "open";
          this.qrCode = undefined;
          console.log("[WhatsApp] 🚀 Connection opened!");
        }
      });

      this.sock.ev.on("creds.update", saveCreds);

      this.sock.ev.on("messages.upsert", async (m: any) => {
        try {
          const msg = m.messages[0];
          console.log("[WhatsApp] Incoming msg key:", JSON.stringify(msg.key));
          if (!msg.message || msg.key.fromMe) {
            console.log("[WhatsApp] Ignoring message (no content or fromMe)");
            return;
          }

          const remoteJid = msg.key.remoteJid;
          const pushName = msg.pushName;
          const text =
            msg.message.conversation || msg.message.extendedTextMessage?.text;

          if (!remoteJid || !text) return;

          console.log(`[WhatsApp] Received message from ${remoteJid}: ${text}`);

          let company = await prisma.company.findFirst();
          if (!company) {
            console.warn("[WhatsApp] No company found, creating default");
            company = await prisma.company.create({
              data: {
                name: "Default Company",
                status: "ACTIVE",
                planId: "pro",
              },
            });
          }

          let phone = remoteJid.split("@")[0];

          // FIX: Map specific Danish number to Colombian number
          if (phone === "45908938997905") {
            console.log(
              "[WhatsApp] Remapping Danish number 45... to 573242450628"
            );
            phone = "573242450628";
          }

          const email = `${phone}@whatsapp.user`;

          let contact = await prisma.user.findUnique({ where: { email } });
          if (!contact) {
            contact = await prisma.user.create({
              data: {
                email,
                name: pushName || phone,
                password: await import("bcryptjs").then((b) =>
                  b.hash("123456", 10)
                ),
                role: "USER",
                companyId: company.id,
              },
            });
          }

          let conversation = await prisma.conversation.findFirst({
            where: {
              companyId: company.id,
              participants: { some: { id: contact.id } },
            },
            orderBy: { updatedAt: "desc" },
          });

          if (!conversation) {
            conversation = await prisma.conversation.create({
              data: {
                companyId: company.id,
                subject: `WhatsApp: ${pushName || phone}`,
                status: "OPEN",
                participants: { connect: [{ id: contact.id }] },
              },
            });
          }

          const newMessage = await prisma.message.create({
            data: {
              content: text,
              channel: "WHATSAPP",
              direction: "INBOUND",
              conversationId: conversation.id,
              senderId: contact.id,
            },
          });

          console.log(
            `[WhatsApp] Message ingested for conversation ${conversation.id}`
          );

          // Emit to socket
          const io = (await import("@/gateways/socketGateway")).gateway.getIO();
          io?.emit("message", {
            ...newMessage,
            ticketId: conversation.id, // Frontend expects ticketId
            senderName: contact.name,
            senderType: "USER",
          });
        } catch (error) {
          console.error(`[WhatsApp] Error processing message: ${error}`);
        }
      });
    } catch (error) {
      console.error(`[WhatsApp] Initialization failed: ${error}`);
      this.connectionState = "close";
      this.qrCode = undefined;
    }
  }

  getStatus() {
    const user = this.sock?.user || this.sock?.authState?.creds?.me;
    console.log(
      `[WhatsApp] getStatus called. State: ${
        this.connectionState
      }, User: ${JSON.stringify(user)}`
    );
    return {
      status: this.connectionState,
      qrCode: this.qrCode,
      user: user,
    };
  }

  getUser() {
    const user = this.sock?.user || this.sock?.authState?.creds?.me;
    console.log(`[WhatsApp] getUser called. User: ${JSON.stringify(user)}`);
    return user;
  }

  async logout() {
    try {
      if (this.sock) {
        await this.sock.logout();
        this.sock.end(undefined);
        this.sock = undefined;
      }
      this.connectionState = "close";
      this.qrCode = undefined;
      await this.deleteSession();
      console.log("[WhatsApp] Logged out and session cleared.");
    } catch (error) {
      console.error(`[WhatsApp] Logout failed: ${error}`);
      // Force cleanup even on error
      this.connectionState = "close";
      await this.deleteSession();
      throw error;
    }
  }

  async sendMessage(to: string, text: string) {
    try {
      console.log(`[WhatsApp] Attempting to send message to: ${to}`);
      if (!this.sock) {
        console.error("[WhatsApp] Socket is undefined!");
        throw new Error("WhatsApp not connected");
      }

      const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
      console.log(`[WhatsApp] Formatted JID: ${jid}`);

      const result = await this.sock.sendMessage(jid, { text });
      console.log(`[WhatsApp] Message sent successfully. Result:`, result);
      return true;
    } catch (error) {
      console.error(`[WhatsApp] Failed to send message: ${error}`);
      return false;
    }
  }

  private async deleteSession() {
    try {
      const sessionPath = path.resolve("baileys_auth_info");
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log("[WhatsApp] Session files deleted");
      }
    } catch (err) {
      console.error(`[WhatsApp] Failed to delete session files: ${err}`);
    }
  }
}

export const whatsappService = new WhatsAppService();
