import { WASocket, proto, WAMessage } from "@whiskeysockets/baileys";
import { SendMessageOptions } from "../../core/types/whatsapp.types";
import { MessageMetadata } from "@/types/whatsapp.types";
import { Prisma, Message } from "@prisma/client";
import { Logger } from "@/utils/logger";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { ticketSyncService } from "@/services/TicketSyncService";
import { messageRepository } from "@/repositories/MessageRepository";
import { chatService } from "@/services/ChatService";
import { SocketEventEmitter } from "@/services/SocketEventEmitter";
import { deduplicationService } from "../../services/DeduplicationService";

const prepareMetadataForDB = (meta: MessageMetadata): Prisma.InputJsonValue => {
  return JSON.parse(JSON.stringify(meta));
};

export class OutboundMessageHelper {
  constructor(private socketEmitter: SocketEventEmitter) {}

  /**
   * Resolves the conversation ID. If the conversation does not exist,
   * falls back to resolving via ticket synchronization mapping.
   */
  async resolveConversationId(conversationId: string, companyId: string): Promise<string> {
    const exists = await conversationRepository.findByIdAndCompanyId(conversationId, companyId);
    if (!exists) {
      const ticketConvId = await ticketSyncService.findConversationIdByTicket(conversationId, companyId);
      if (ticketConvId) {
        return ticketConvId;
      }
    }
    return conversationId;
  }

  /**
   * Resolves quoted message references (mapping UUID to WhatsApp message ID).
   * Safely handles missing participant issues in group chats to avoid silent drops.
   */
  async resolveQuotedMessage(
    options: SendMessageOptions,
    jid: string,
    conversationId: string,
  ): Promise<WAMessage | undefined> {
    if (!options.quotedMessageId) return undefined;

    const dbQuoted = await messageRepository.findFirst({
      where: { id: options.quotedMessageId, companyId: options.companyId },
    });

    if (dbQuoted && dbQuoted.whatsappMessageId) {
      const isGroup = jid.endsWith("@g.us");
      const participant = dbQuoted.direction === "INBOUND" && isGroup
        ? ((dbQuoted.metadata as Prisma.JsonObject)?.senderJid as string | undefined) 
        : undefined;

      // [SEC] CRITICAL FIX: WhatsApp silently drops group messages if they quote a message
      // but lack the 'participant' field. If we don't have the senderJid, we MUST omit the quote!
      if (isGroup && dbQuoted.direction === "INBOUND" && !participant) {
        Logger.warn(`[OutboundHandler] Missing senderJid for quoted group message. Dropping quote to ensure delivery.`);
        // Notify the agent in real-time that the quote was dropped
        this.socketEmitter.emitSystemWarning(
          conversationId,
          options.companyId,
          "La cita del mensaje no pudo adjuntarse (falta información del remitente original en el grupo). El mensaje fue enviado sin cita.",
        );
        return undefined;
      }

      return {
        key: {
          remoteJid: jid,
          fromMe: dbQuoted.direction === "OUTBOUND",
          id: dbQuoted.whatsappMessageId,
          participant: participant,
        },
        message: {
          conversation:
            (options.metadata?.quotedContent as string) ||
            dbQuoted.content ||
            "Original message",
        },
      };
    }

    return undefined;
  }

  /**
   * Pre-fetches group metadata so Baileys distributes the Sender Key correctly,
   * avoiding silent message drops by WhatsApp after backend restarts.
   */
  async ensureGroupMetadata(sock: WASocket, jid: string): Promise<void> {
    if (jid.endsWith("@g.us")) {
      try {
        await sock.groupMetadata(jid);
        Logger.info(`[OutboundHandler] Fetched group metadata for ${jid} before sending.`);
      } catch (err) {
        Logger.warn(`[OutboundHandler] Failed to fetch group metadata for ${jid} before sending:`, err);
      }
    }
  }


  /**
   * Handles database persistence, AI human-in-the-loop auto-mute, and websocket events post message transmission.
   */
  async handlePostSend({
    companyId,
    conversationId,
    senderId,
    content,
    sentMsgId,
    generatedId,
    metadata,
    dbId,
  }: {
    companyId: string;
    conversationId: string;
    senderId?: string;
    content: string;
    sentMsgId?: string;
    generatedId: string;
    metadata?: MessageMetadata;
    dbId?: string;
  }): Promise<Message> {
    // [SEC] DEDUP FIX: Also mark the FINAL Baileys ID to prevent echo processing.
    if (sentMsgId && sentMsgId !== generatedId) {
      await deduplicationService.markMessageSent(sentMsgId);
    }

    const mergedMeta: MessageMetadata = {
      messageId: sentMsgId,
      ...metadata,
    };

    let savedMessage: Message;

    if (dbId) {
      // [SEC] Layered Isolation: Check if message exists before updating to prevent Prisma update crash
      const exists = await messageRepository.findFirst({
        where: { id: dbId, companyId },
      });

      if (exists) {
        savedMessage = await messageRepository.update(dbId, {
          whatsappMessageId: sentMsgId || generatedId,
          status: "SENT",
          metadata: prepareMetadataForDB(mergedMeta) as Prisma.InputJsonValue,
        }, companyId);
      } else {
        Logger.warn(`[OutboundHandler] Message record ${dbId} not found in company ${companyId}. Falling back to upsert.`);
        savedMessage = await chatService.upsertMessage({
          whatsappMessageId: sentMsgId || generatedId,
          companyId,
          content,
          direction: "OUTBOUND",
          conversationId,
          senderId,
          status: "SENT",
          metadata: prepareMetadataForDB(mergedMeta),
        });
      }
    } else {
      savedMessage = await chatService.upsertMessage({
        whatsappMessageId: sentMsgId || `temp_${Date.now()}`,
        companyId,
        content,
        direction: "OUTBOUND",
        conversationId,
        senderId,
        status: "SENT",
        metadata: prepareMetadataForDB(mergedMeta),
      });
    }

    const isAiGenerated = metadata?.aiGenerated === true;
    const isFlowGenerated = metadata?.flowGenerated === true;

    if (!isAiGenerated && !isFlowGenerated) {
      try {
        await chatService.updateConversation(companyId, conversationId, {
          aiEnabled: false,
          lastManualIntervention: new Date(),
        });
        Logger.info(
          `[HITL] [OK] AI muted for conversation ${conversationId} (human agent intervention)`,
        );
      } catch (err) {
        Logger.error("[HITL] Failed to auto-mute AI:", err);
      }
    } else {
      Logger.info(
        `[HITL] [SKIP] Skipping AI mute - message is ${
          isAiGenerated ? "AI-generated" : "Flow-generated"
        }`,
      );
    }

    try {
      await chatService.updateConversation(companyId, conversationId, {});
      const fullConv = await chatService.getFullConversation(companyId, conversationId);
      if (fullConv) {
        try {
          const { gateway } = await import("@/gateways/socketGateway");
          const { SocketEventEmitter } = await import("@/services/SocketEventEmitter");
          const socketEmitter = new SocketEventEmitter(gateway);

          if (dbId) {
            socketEmitter.emitMessageStatus(dbId, conversationId, companyId, "sent");
          }

          type Emits = InstanceType<
            typeof import("@/services/SocketEventEmitter").SocketEventEmitter
          >["emitMessageSent"];
          socketEmitter.emitMessageSent(
            savedMessage as Parameters<Emits>[0],
            fullConv as Parameters<Emits>[1],
          );
        } catch (err: unknown) {
          Logger.warn("[OutboundHandler] Failed to emit socket", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (postSendErr) {
      Logger.warn("[OutboundHandler] Post-send updates failed (message already dispatched to WhatsApp):", postSendErr);
    }

    return savedMessage;
  }
}
