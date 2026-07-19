import { Channel } from "@prisma/client";
import { ReplyDTO } from "@/types/conversation.types";
import { IMessagingProvider, ConversationWithContact, SendMessageResult } from "../interfaces/IMessagingProvider";
import { whatsappMessagingService, SendMessageOptions } from "@/whatsapp";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";
import { ticketSyncService } from "@/services/TicketSyncService";
import { AppError } from "@/utils/AppError";

export class WhatsAppMessagingProvider implements IMessagingProvider {
  supports(channel: Channel): boolean {
    return channel === Channel.WHATSAPP;
  }

  async send(
    dto: ReplyDTO,
    conversation: ConversationWithContact,
  ): Promise<SendMessageResult> {
    const {
      companyId,
      userId,
      content,
      attachment,
      metadata,
      quotedMessageId,
      quotedContent,
    } = dto;

    const initialTargetJid = WhatsAppIdUtils.getTargetJid(conversation.channelId);
    const isGroup = conversation.isGroup || initialTargetJid.endsWith("@g.us");
    let targetPhone = conversation.channelId;

    if (!isGroup) {
      const isCleanPhone = !!(targetPhone && /^\d+$/.test(targetPhone.replace("@s.whatsapp.net", "")));
      if (!isCleanPhone) {
        if (conversation.contact?.phone) {
          targetPhone = conversation.contact.phone;
        } else {
          targetPhone = (await ticketSyncService.findPhoneByConversation(companyId, conversation.id)) || null;
        }
      }
    }

    if (!targetPhone || targetPhone.length < 5) {
      throw new AppError("No se pudo determinar el numero de teléfono del destinatario.", 400);
    }

    targetPhone = WhatsAppIdUtils.getTargetJid(targetPhone);
    const messageContent = content || "";

    const options: SendMessageOptions = {
      companyId,
      conversationId: conversation.id,
      senderId: userId,
      media: attachment ? {
        type: attachment.type,
        url: attachment.url,
        mimetype: attachment.mimetype || attachment.mimeType || "application/octet-stream",
        filename: attachment.name,
        caption: content || undefined,
        location: attachment.type === "location" ? {
          latitude: Number(attachment.latitude),
          longitude: Number(attachment.longitude),
          name: (attachment.locationName as string | undefined) || attachment.name,
          address: attachment.address as string | undefined,
        } : undefined,
        contact: attachment.type === "contact" ? {
          name: (attachment.contactName as string | undefined) || attachment.name,
          phone: String(attachment.phone || ""),
        } : undefined,
      } : undefined,
      metadata: { 
        ...metadata, 
        quotedMessageId, 
        quotedContent, 
        attachment, 
        type: attachment ? attachment.type : "text", 
        mediaUrl: attachment ? attachment.url : undefined 
      },
      quotedMessageId,
    };

    const sent = await whatsappMessagingService.sendMessage(targetPhone, messageContent, options);

    return {
      id: sent.dbId || sent.messageId,
      content: sent.content,
      timestamp: sent.timestamp,
      status: "SENT",
      sender: "agent",
      metadata: {
        ...(sent.metadata || {}),
        attachment,
        type: attachment ? attachment.type : "text",
        mediaUrl: attachment ? attachment.url : undefined,
      },
      type: attachment ? attachment.type : "text",
      mediaUrl: attachment ? attachment.url : undefined,
    };
  }
}
