import { Conversation, Message, User } from "@prisma/client";

export type ConversationWithRelations = Conversation & {
  participants?: User[];
  assignedTo?: User | null;
  messages?: Message[];
  unreadCount?: number | null;
  contact?: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    profilePicUrl?: string | null;
    avatarUrl?: string | null;
    about?: string | null;
  } | null;
};

export type MessageWithSender = Message & {
  sender?: User | null;
};

export interface ISocketGateway {
  emitToCompany(
    companyId: string,
    event: string,
    data: Record<string, unknown>,
  ): void;
  emitToUser?(
    userId: string,
    event: string,
    data: Record<string, unknown>,
  ): void;
  emitToRoom?(room: string, event: string, data: Record<string, unknown>): void;
}

export class SocketEventFormatter {
  /**
   * Format conversation for client consumption
   * Removes sensitive data, normalizes structure, and maps contact info
   */
  static formatConversation(conversation: ConversationWithRelations) {
    const lastMessage = conversation.messages?.[0];

    const isGroup = (conversation as Record<string, unknown>).isGroup === true;
    const groupMetadata = (conversation as Record<string, unknown>).groupMetadata as {
      groupPicUrl?: string | null;
      groupName?: string;
    } | null | undefined;

    const contact = conversation.contact
      ? {
          id: conversation.contact.id,
          name: conversation.contact.name,
          phone: conversation.contact.phone,
          email: conversation.contact.email,
          profilePicUrl: isGroup
            ? groupMetadata?.groupPicUrl || conversation.contact.profilePicUrl || conversation.contact.avatarUrl
            : conversation.contact.profilePicUrl || conversation.contact.avatarUrl,
          about: conversation.contact.about,
          role: "USER" as const,
          channelId: conversation.channelId,
        }
      : (() => {
          const customerParticipant = conversation.participants?.find(
            (p) => p.role === "USER" || p.phone === conversation.channelId,
          );
          return customerParticipant
            ? {
                id: customerParticipant.id,
                name: customerParticipant.name || customerParticipant.phone,
                phone: customerParticipant.phone,
                email: customerParticipant.email,
                profilePicUrl: isGroup
                  ? groupMetadata?.groupPicUrl || customerParticipant.profilePicUrl
                  : customerParticipant.profilePicUrl,
                about: customerParticipant.about,
                role: customerParticipant.role,
                channelId: conversation.channelId,
              }
            : null;
        })();

    return {
      id: conversation.id,
      companyId: conversation.companyId,
      channelId: conversation.channelId,
      subject: conversation.subject,
      status: conversation.status,
      isGroup,
      assignedTo: conversation.assignedTo
        ? {
            id: conversation.assignedTo.id,
            name: conversation.assignedTo.name,
            email: conversation.assignedTo.email,
          }
        : null,
      participants: conversation.participants?.map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        phone: p.phone,
        role: p.role,
      })),
      contact: contact,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            content: lastMessage.content,
            createdAt: lastMessage.createdAt,
            direction: lastMessage.direction,
          }
        : null,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      unreadCount: conversation.unreadCount || 0,
    };
  }

  /**
   * Format message for client consumption
   */
  static formatMessage(message: MessageWithSender) {
    const mediaMeta = (message.metadata as Record<string, unknown> | null)?.media as { type?: string; url?: string } | undefined;
    return {
      id: message.id,
      senderId: message.senderId,
      conversationId: message.conversationId,
      content: message.content,
      direction: message.direction,
      status: message.status,
      mediaType: mediaMeta?.type || null,
      mediaUrl: mediaMeta?.url || null,
      sender: message.sender
        ? {
            id: message.sender.id,
            name: message.sender.name,
            email: message.sender.email,
          }
        : null,
      createdAt: message.createdAt,
      metadata: message.metadata,
    };
  }
}
