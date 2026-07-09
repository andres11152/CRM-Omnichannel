import { User } from "@prisma/client";
import { gateway } from "@/gateways/socketGateway";
import type {
  ConversationWithQueue,
  MessageWithSender,
  SocketDashboardPayload,
} from "@/types/message.types";

/**
 * [WS] SOCKET EMITTER
 *
 * Single Responsibility: Emits real-time socket events for new messages.
 */
export class SocketEmitter {
  emit(
    conversation: ConversationWithQueue,
    message: MessageWithSender,
    displayName: string,
    companyId: string,
    isOutbound: boolean,
    contactId: string,
    user: User | null,
  ): void {
    const io = gateway.getIO();
    if (!io) return;

    // Emit to conversation room
    io.to(conversation.id).emit("conversation.new_message", message);

    // Emit to company dashboard
    const dashboardPayload: SocketDashboardPayload = {
      id: conversation.id,
      channel: conversation.channel,
      subject: displayName,
      lastMessage: message.content,
      lastMessageAt: message.createdAt,
      unreadCount: !isOutbound ? (conversation.unreadCount || 0) + 1 : 0,
      contact: {
        id: contactId,
        name: displayName,
        phone: conversation.channelId,
        avatarUrl: null,
        profilePicUrl: user?.profilePicUrl || null,
        about: user?.about || null,
      },
    };

    io.to(`company:${companyId}`).emit(
      "conversation.updated",
      dashboardPayload,
    );
  }
}

export const socketEmitter = new SocketEmitter();
