import { Channel, Prisma } from "@prisma/client";
import { ReplyDTO } from "@/types/conversation.types";
import { IMessagingProvider, ConversationWithContact, SendMessageResult } from "../interfaces/IMessagingProvider";
import { instagramSessionRepository } from "@/instagram/InstagramSessionRepository";
import { instagramProviderService, InstagramMediaContent } from "@/instagram/InstagramProviderService";
import { messageRepository } from "@/repositories/MessageRepository";
import { AppError } from "@/utils/AppError";

export class InstagramMessagingProvider implements IMessagingProvider {
  supports(channel: Channel): boolean {
    return channel === Channel.INSTAGRAM_DM;
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

    const igsid = conversation.channelId;
    if (!igsid) {
      throw new AppError("No se pudo determinar el destinatario de Instagram.", 400);
    }

    const sessions = await instagramSessionRepository.findByCompany(companyId);
    const session = sessions.find((s) => s.status === "CONNECTED") || sessions[0];
    if (!session) {
      throw new AppError("No hay una sesión de Instagram conectada para esta empresa.", 400);
    }

    const mediaContent: InstagramMediaContent | null = attachment
      ? { type: attachment.type === "document" ? "file" : (attachment.type as "image" | "video" | "audio"), url: attachment.url }
      : null;

    const messageContent = content || "";

    const sendResult = await instagramProviderService.sendMessage(
      session.igBusinessAccountId,
      igsid,
      mediaContent || messageContent,
    );

    const savedMessage = await messageRepository.create({
      data: {
        companyId,
        conversationId: conversation.id,
        content: messageContent,
        direction: "OUTBOUND",
        senderId: userId,
        channel: Channel.INSTAGRAM_DM,
        status: "SENT",
        instagramMessageId: sendResult.messageId,
        metadata: {
          ...metadata,
          quotedMessageId,
          quotedContent,
          attachment,
          type: attachment ? attachment.type : "text",
          mediaUrl: attachment ? attachment.url : undefined,
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
      type: attachment ? attachment.type : "text",
      mediaUrl: attachment ? attachment.url : undefined,
    };
  }
}
