import { Logger } from "@/utils/logger";
import {
  ISocketGateway,
  ConversationWithRelations,
  MessageWithSender,
  SocketEventFormatter,
} from "./SocketEventFormatter";

export class MessageSocketEmitter {
  constructor(private readonly socketGateway: ISocketGateway) {}

  emitMessageReceived(
    message: MessageWithSender,
    conversation: ConversationWithRelations,
    ticketId?: string,
  ): void {
    Logger.info(`[SocketEvents] [SOUND] Emitting message.received: ${message.id}`);

    const messagePayload = SocketEventFormatter.formatMessage(message);
    const messagePayloadWithTicket = ticketId ? { ...messagePayload, ticketId } : messagePayload;

    this.socketGateway.emitToCompany(
      conversation.companyId,
      "conversation.new_message",
      messagePayloadWithTicket,
    );
    if (this.socketGateway.emitToRoom) {
      this.socketGateway.emitToRoom(
        `conversation:${conversation.id}`,
        "conversation.new_message",
        messagePayloadWithTicket,
      );
    }

    this.socketGateway.emitToCompany(
      conversation.companyId,
      "conversation.updated",
      {
        id: conversation.id,
        ...SocketEventFormatter.formatConversation(conversation),
        lastMessage: message.content,
        lastMessageAt: message.createdAt.toISOString(),
      },
    );

    this.socketGateway.emitToCompany(
      conversation.companyId,
      "message.received",
      {
        ticketId,
        message: messagePayload,
        conversation: SocketEventFormatter.formatConversation(conversation),
        timestamp: new Date().toISOString(),
      },
    );
  }

  emitMessageSent(
    message: MessageWithSender,
    conversation: ConversationWithRelations,
    ticketId?: string,
  ): void {
    Logger.info(`[SocketEvents] [SOUND] Emitting message.sent: ${message.id}`);

    const messagePayload = SocketEventFormatter.formatMessage(message);
    const messagePayloadWithTicket = ticketId ? { ...messagePayload, ticketId } : messagePayload;

    this.socketGateway.emitToCompany(
      conversation.companyId,
      "conversation.new_message",
      messagePayloadWithTicket,
    );
    if (this.socketGateway.emitToRoom) {
      this.socketGateway.emitToRoom(
        `conversation:${conversation.id}`,
        "conversation.new_message",
        messagePayloadWithTicket,
      );
    }

    this.socketGateway.emitToCompany(
      conversation.companyId,
      "conversation.updated",
      {
        id: conversation.id,
        ...SocketEventFormatter.formatConversation(conversation),
        lastMessage: message.content,
        lastMessageAt: message.createdAt.toISOString(),
      },
    );

    this.socketGateway.emitToCompany(conversation.companyId, "message.sent", {
      ticketId,
      message: messagePayload,
      conversation: SocketEventFormatter.formatConversation(conversation),
      timestamp: new Date().toISOString(),
    });
  }

  emitMessageStatus(
    messageId: string,
    conversationId: string,
    companyId: string,
    status: "sent" | "delivered" | "read" | "failed" | "queued",
    ticketId?: string,
  ): void {
    Logger.info(
      `[SocketEvents] [SOUND] Emitting message.status: ${messageId} → ${status} (ticketId: ${ticketId || "none"})`,
    );

    const payload = {
      messageId,
      conversationId,
      ...(ticketId && { ticketId }),
      status,
      timestamp: new Date().toISOString(),
    };

    this.socketGateway.emitToCompany(companyId, "message.status", payload);
    if (this.socketGateway.emitToRoom) {
      this.socketGateway.emitToRoom(`conversation:${conversationId}`, "message.status", payload);
    }
  }

  emitMessageRevoked(
    messageId: string,
    conversationId: string,
    companyId: string,
  ): void {
    Logger.info(`[SocketEvents] [SOUND] Emitting message.revoked: ${messageId}`);

    const payload = {
      messageId,
      conversationId,
      content: " Este mensaje fue eliminado",
      status: "REVOKED",
      timestamp: new Date().toISOString(),
    };

    this.socketGateway.emitToCompany(companyId, "message.revoked", payload);
    if (this.socketGateway.emitToRoom) {
      this.socketGateway.emitToRoom(`conversation:${conversationId}`, "message.revoked", payload);
    }
  }

  emitMessageDeleted(
    messageId: string,
    conversationId: string,
    companyId: string,
  ): void {
    Logger.info(`[SocketEvents] Emitting message.deleted: ${messageId}`);

    const payload = {
      messageId,
      conversationId,
      timestamp: new Date().toISOString(),
    };

    this.socketGateway.emitToCompany(companyId, "message.deleted", payload);
    if (this.socketGateway.emitToRoom) {
      this.socketGateway.emitToRoom(
        `conversation:${conversationId}`,
        "message.deleted",
        payload,
      );
    }
  }

  emitMessageReaction(
    messageId: string,
    conversationId: string,
    companyId: string,
    reaction: string,
    participant: string,
  ): void {
    Logger.info(`[SocketEvents] [SOUND] Emitting message.reaction: ${messageId}`);

    const payload = {
      messageId,
      conversationId,
      reaction,
      participant,
      timestamp: new Date().toISOString(),
    };

    this.socketGateway.emitToCompany(companyId, "message.reaction", payload);
    if (this.socketGateway.emitToRoom) {
      this.socketGateway.emitToRoom(
        `conversation:${conversationId}`,
        "message.reaction",
        payload,
      );
    }
  }

  emitMessagePinned(
    messageId: string,
    conversationId: string,
    companyId: string,
    isPinned: boolean,
    content: string,
    senderId: string,
  ): void {
    Logger.info(
      `[SocketEvents] [PIN] Emitting message.pinned: ${messageId} (${isPinned ? "PINNED" : "UNPINNED"})`,
    );

    const payload = {
      messageId,
      conversationId,
      isPinned,
      content,
      senderId,
      timestamp: new Date().toISOString(),
    };

    this.socketGateway.emitToCompany(companyId, "message.pinned", payload);
    if (this.socketGateway.emitToRoom) {
      this.socketGateway.emitToRoom(`conversation:${conversationId}`, "message.pinned", payload);
    }
  }
}
