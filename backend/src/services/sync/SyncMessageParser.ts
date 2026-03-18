import { WAMessage, getContentType } from "@whiskeysockets/baileys";
import { MessageDirection, MediaType } from "@prisma/client";

export class SyncMessageParser {
  /**
   * 🕛 Extracts Unix timestamp safely from WAMessage
   */
  getTimestamp(ts: unknown): number {
    if (typeof ts === "number") return ts;
    if (!ts) return 0;
    if (typeof ts === "string") return Number(ts);

    if (typeof ts === "object") {
      const obj = ts as { toNumber?: () => number; low?: number };
      if (typeof obj.toNumber === "function") return obj.toNumber();
      if (typeof obj.low === "number") return obj.low;
    }

    return Number(ts);
  }

  /**
   * 🛡️ Validates that a WAMessage is ingestible
   */
  isValid(msg: WAMessage): boolean {
    const stubType = (msg as WAMessage & { messageStubType?: number }).messageStubType;
    if (!msg.message && !stubType) return false;
    if (!msg.key?.id) return false;

    const ts = this.getTimestamp(msg.messageTimestamp);
    if (!ts || isNaN(ts) || ts < 946684800) return false;

    return true;
  }

  /**
   * 📑 UNWRAP CONTENT
   * Handles Ephemeral, ViewOnce, and other wrapper types.
   */
  unwrapContent(msg: WAMessage) {
    let msgContent = msg.message || {};

    if ("ephemeralMessage" in msgContent && msgContent.ephemeralMessage?.message) {
      msgContent = msgContent.ephemeralMessage.message;
    }

    if ("viewOnceMessageV2" in msgContent && msgContent.viewOnceMessageV2?.message) {
      msgContent = msgContent.viewOnceMessageV2.message;
    } else if ("viewOnceMessage" in msgContent && msgContent.viewOnceMessage?.message) {
      msgContent = msgContent.viewOnceMessage.message;
    } else if ("documentWithCaptionMessage" in msgContent && msgContent.documentWithCaptionMessage?.message) {
      msgContent = msgContent.documentWithCaptionMessage.message;
    }

    return msgContent;
  }

  /**
   * 📝 PARSE MESSAGE CONTENT
   * Extracts text representation and identifies media types.
   */
  parseContent(msg: WAMessage) {
    const msgContent = this.unwrapContent(msg);
    const messageType = msg.message ? getContentType(msg.message) : undefined;

    let textContent = "";
    let mediaType: string | undefined;
    let mediaCaption: string | undefined;
    let mediaFilename: string | undefined;

    if (
      messageType &&
      ["senderKeyDistributionMessage", "keepInChatMessage", "pollUpdateMessage"].includes(messageType)
    ) {
      return null;
    }

    // Reaction Handling handled by separate service or logic
    if (messageType === "reactionMessage") return { type: "reaction", content: msgContent.reactionMessage };

    // Text Content
    if (messageType === "conversation") {
      textContent = msg.message?.conversation || "";
    } else if (messageType === "extendedTextMessage") {
      textContent = msg.message?.extendedTextMessage?.text || "";
    } else if (messageType === "protocolMessage") {
      const proto = msg.message?.protocolMessage as { type?: number | string };
      textContent = (proto.type === 0 || proto.type === "REVOKE") ? "🚫 Este mensaje fue eliminado" : "[Sistema/Protocolo]";
    } 
    // Media Types
    else if (messageType === "imageMessage") {
      mediaType = "image";
      mediaCaption = msg.message?.imageMessage?.caption || undefined;
      textContent = mediaCaption || "[📷 Imagen]";
    } else if (messageType === "videoMessage") {
      mediaType = "video";
      mediaCaption = msg.message?.videoMessage?.caption || undefined;
      textContent = mediaCaption || "[🎬 Video]";
    } else if (messageType === "audioMessage") {
      mediaType = "audio";
      textContent = "[🎤 Audio]";
    } else if (messageType === "documentMessage") {
      mediaType = "document";
      mediaFilename = msg.message?.documentMessage?.fileName || undefined;
      textContent = mediaFilename || "[📄 Documento]";
    } else if (messageType === "stickerMessage") {
      mediaType = "sticker";
      textContent = "[Sticker]";
    } else if (messageType === "contactMessage") {
      mediaType = "contact";
      textContent = "[Contacto]";
    } else if (messageType === "locationMessage") {
      mediaType = "location";
      textContent = "[Ubicación]";
    } else if (messageType === "buttonsResponseMessage") {
      textContent = (msg.message?.buttonsResponseMessage?.selectedButtonId as string) || "[Respuesta de Botón]";
    } else if (messageType === "listResponseMessage") {
      textContent = (msg.message?.listResponseMessage?.title as string) || "[Respuesta de Lista]";
    } else if (messageType === "templateButtonReplyMessage") {
      textContent = (msg.message?.templateButtonReplyMessage?.selectedId as string) || "[Respuesta de Plantilla]";
    } else {
      textContent = "[Mensaje]";
    }

    if (!textContent || textContent.trim().length === 0) textContent = "[Mensaje]";

    return {
      type: "message",
      textContent,
      mediaType,
      mediaCaption,
      mediaFilename,
      msgContent,
      direction: msg.key.fromMe ? MessageDirection.OUTBOUND : MessageDirection.INBOUND
    };
  }
}

export const syncMessageParser = new SyncMessageParser();
