import { WAMessage, getContentType, proto } from "@whiskeysockets/baileys";
import { MessageDirection } from "@prisma/client";

/**
 * [DEV] Minimum required interface for message processing
 */
interface WhatsAppMessageContent {
  conversation?: string | null;
  extendedTextMessage?: Record<string, unknown> | null;
  imageMessage?: Record<string, unknown> | null;
  videoMessage?: Record<string, unknown> | null;
  audioMessage?: Record<string, unknown> | null;
  documentMessage?: Record<string, unknown> | null;
  stickerMessage?: Record<string, unknown> | null;
  locationMessage?: Record<string, unknown> | null;
  contactMessage?: Record<string, unknown> | null;
  reactionMessage?: Record<string, unknown> | null;
  buttonsResponseMessage?: Record<string, unknown> | null;
  listResponseMessage?: Record<string, unknown> | null;
  templateButtonReplyMessage?: Record<string, unknown> | null;
  protocolMessage?: Record<string, unknown> | null;
  ephemeralMessage?: Record<string, unknown> | null;
  viewOnceMessageV2?: Record<string, unknown> | null;
  viewOnceMessage?: Record<string, unknown> | null;
  documentWithCaptionMessage?: Record<string, unknown> | null;
  contextInfo?: proto.IContextInfo | null;
  [key: string]: unknown;
}

export interface ParsedMessage {
  type: "message" | "reaction";
  textContent: string;
  mediaType?: "image" | "video" | "audio" | "document" | "sticker" | "contact" | "location";
  mediaCaption?: string;
  mediaFilename?: string;
  direction: MessageDirection;
  msgContent: WhatsAppMessageContent;
  contextInfo?: {
    quotedMessageId?: string | null;
    quotedParticipant?: string | null;
    quotedContent?: string;
  };
  content?: Record<string, unknown>; // For reactions
}

export class SyncMessageParser {
  /**
   *  Extracts Unix timestamp safely from WAMessage
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
   * [SEC] Validates that a WAMessage is ingestible
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
   *  UNWRAP CONTENT
   * Handles Ephemeral, ViewOnce, and other wrapper types.
   */
  unwrapContent(msg: WAMessage): WhatsAppMessageContent {
    let msgContent = (msg.message || {}) as WhatsAppMessageContent;

    if (msgContent['ephemeralMessage']?.['message']) {
      msgContent = (msgContent['ephemeralMessage'] as Record<string, unknown>).message as WhatsAppMessageContent;
    }

    if (msgContent['viewOnceMessageV2']?.['message']) {
      msgContent = (msgContent['viewOnceMessageV2'] as Record<string, unknown>).message as WhatsAppMessageContent;
    } else if (msgContent['viewOnceMessage']?.['message']) {
      msgContent = (msgContent['viewOnceMessage'] as Record<string, unknown>).message as WhatsAppMessageContent;
    } else if (msgContent['documentWithCaptionMessage']?.['message']) {
      msgContent = (msgContent['documentWithCaptionMessage'] as Record<string, unknown>).message as WhatsAppMessageContent;
    }

    return msgContent;
  }

  /**
   *  PARSE MESSAGE CONTENT
   * Extracts text representation and identifies media types.
   */
  parseContent(msg: WAMessage): ParsedMessage | null {
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

    // Reaction Handling
    if (messageType === "reactionMessage") {
      return { 
        type: "reaction", 
        content: msgContent.reactionMessage as Record<string, unknown>,
        textContent: "[Reacción]",
        direction: msg.key.fromMe ? MessageDirection.OUTBOUND : MessageDirection.INBOUND,
        msgContent
      };
    }

    // Text Content
    if (messageType === "conversation") {
      textContent = msgContent.conversation || "";
    } else if (messageType === "extendedTextMessage") {
      textContent = (msgContent.extendedTextMessage as Record<string, unknown>)?.text as string || "";
    } else if (messageType === "protocolMessage") {
      const protoMsg = msgContent.protocolMessage as Record<string, unknown>;
      // 0 is REVOKE in Baileys proto
      textContent = (protoMsg?.type === 0 || String(protoMsg?.type) === "REVOKE") 
        ? " Este mensaje fue eliminado" 
        : "[Sistema/Protocolo]";
    } 
    // Media Types
    else if (messageType === "imageMessage") {
      mediaType = "image";
      mediaCaption = (msgContent.imageMessage as Record<string, unknown>)?.caption as string || undefined;
      textContent = mediaCaption || "[ Imagen]";
    } else if (messageType === "videoMessage") {
      mediaType = "video";
      mediaCaption = (msgContent.videoMessage as Record<string, unknown>)?.caption as string || undefined;
      textContent = mediaCaption || "[ Video]";
    } else if (messageType === "audioMessage") {
      mediaType = "audio";
      textContent = "[ Audio]";
    } else if (messageType === "documentMessage") {
      mediaType = "document";
      mediaFilename = (msgContent.documentMessage as Record<string, unknown>)?.fileName as string || undefined;
      textContent = mediaFilename || "[ Documento]";
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
      textContent = (msgContent.buttonsResponseMessage as Record<string, unknown>)?.selectedButtonId as string || "[Respuesta de Botón]";
    } else if (messageType === "listResponseMessage") {
      textContent = (msgContent.listResponseMessage as Record<string, unknown>)?.title as string || "[Respuesta de Lista]";
    } else if (messageType === "templateButtonReplyMessage") {
      textContent = (msgContent.templateButtonReplyMessage as Record<string, unknown>)?.selectedId as string || "[Respuesta de Plantilla]";
    } else {
      textContent = "[Mensaje]";
    }

    if (!textContent || textContent.trim().length === 0) textContent = "[Mensaje]";

    const contextInfo = this.extractContextInfo(msgContent);

    return {
      type: "message",
      textContent,
      mediaType: mediaType as ParsedMessage["mediaType"],
      mediaCaption,
      mediaFilename,
      msgContent,
      direction: msg.key.fromMe ? MessageDirection.OUTBOUND : MessageDirection.INBOUND,
      contextInfo
    };
  }

  /**
   * [FILE] EXTRACT CONTEXT INFO (Replies / Mentions)
   */
  private extractContextInfo(msgContent: WhatsAppMessageContent) {
    const contextInfo = msgContent?.contextInfo;
    if (!contextInfo) return undefined;

    const quotedMessageId = contextInfo.stanzaId;
    const quotedParticipant = contextInfo.participant;
    let quotedContent = "";

    if (contextInfo.quotedMessage) {
      const qm = contextInfo.quotedMessage as Record<string, unknown>;
      // Extract text content from the quoted message
      if (qm.conversation) {
        quotedContent = qm.conversation as string;
      } else if (qm.extendedTextMessage) {
        quotedContent = (qm.extendedTextMessage as Record<string, unknown>).text as string || "";
      } else if (qm.imageMessage) {
        quotedContent = (qm.imageMessage as Record<string, unknown>).caption as string || "[ Imagen]";
      } else if (qm.videoMessage) {
        quotedContent = (qm.videoMessage as Record<string, unknown>).caption as string || "[ Video]";
      } else if (qm.audioMessage) {
        quotedContent = "[ Audio]";
      } else if (qm.documentMessage) {
        quotedContent = (qm.documentMessage as Record<string, unknown>).fileName as string || "[ Documento]";
      } else if (qm.stickerMessage) {
        quotedContent = "[Sticker]";
      } else {
        quotedContent = "[Mensaje]";
      }
    }

    return {
       quotedMessageId,
       quotedParticipant,
       quotedContent,
    };
  }
}

export const syncMessageParser = new SyncMessageParser();


