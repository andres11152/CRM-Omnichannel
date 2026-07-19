import { Channel, Prisma } from "@prisma/client";
import { ReplyDTO } from "@/types/conversation.types";
import { IMessagingProvider, ConversationWithContact, SendMessageResult } from "../interfaces/IMessagingProvider";
import { emailService } from "@/services/email/emailService";
import { messageRepository } from "@/repositories/MessageRepository";
import { AppError } from "@/utils/AppError";

export class EmailMessagingProvider implements IMessagingProvider {
  supports(channel: Channel): boolean {
    return channel === Channel.EMAIL;
  }

  async send(
    dto: ReplyDTO,
    conversation: ConversationWithContact,
  ): Promise<SendMessageResult> {
    const {
      companyId,
      userId,
      content,
      metadata,
    } = dto;

    const toEmail = conversation.contact?.email || null;
    if (!toEmail) {
      throw new AppError("No se pudo determinar el destinatario del correo.", 400);
    }

    const messageContent = content || "";

    const sendResult = await emailService.sendEmail({
      companyId,
      from: `no-reply@${process.env.MAIL_DOMAIN || "localhost"}`,
      to: [toEmail],
      subject: conversation.subject || "Respuesta de Omnicanal",
      bodyHtml: messageContent,
      bodyText: messageContent,
    });

    const savedMessage = await messageRepository.create({
      data: {
        companyId,
        conversationId: conversation.id,
        content: messageContent,
        direction: "OUTBOUND",
        senderId: userId,
        channel: Channel.EMAIL,
        status: "SENT",
        emailMessageId: sendResult.messageId,
        metadata: {
          ...metadata,
          emailMessageId: sendResult.messageId,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      id: savedMessage.id,
      content: savedMessage.content,
      timestamp: savedMessage.createdAt,
      status: "SENT",
      sender: "agent",
      metadata: savedMessage.metadata,
      type: "text",
    };
  }
}
