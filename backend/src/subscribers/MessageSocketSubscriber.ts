import {
  DomainEventBus,
  DomainEventType,
  MessageReceivedEvent,
} from "@/events/DomainEventBus";
import { gateway } from "@/gateways/socketGateway";
import { Logger } from "@/utils/logger";
import { SocketEventEmitter } from "@/services/socketEventEmitter";
import { messageRepository } from "@/repositories/MessageRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";

export class MessageSocketSubscriber {
  private socketEmitter: SocketEventEmitter;

  constructor(private eventBus: DomainEventBus) {
    this.socketEmitter = new SocketEventEmitter(gateway);
    this.setupListeners();
  }

  private setupListeners() {
    this.eventBus.on(
      DomainEventType.MESSAGE_RECEIVED,
      (payload: MessageReceivedEvent) => {
        this.handleMessageReceived(payload);
      },
    );
  }

  private async handleMessageReceived(payload: MessageReceivedEvent) {
    try {
      const { message, conversationId } = payload;
      Logger.debug(`[SocketSubscriber] Handling message ${message.id}`);

      // 1. Fetch relations required for Frontend (Sender, Participants)
      const fullMessage = await messageRepository.findFirst({
        where: { id: message.id },
        include: { sender: true },
      });

      const fullConversation = await conversationRepository.findFirst({
        where: { id: conversationId },
        include: {
          participants: true,
          assignedTo: true,
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
          },
          tickets: {
            where: { status: { not: "CLOSED" } },
            take: 1,
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!fullMessage || !fullConversation) {
        Logger.warn(
          `[SocketSubscriber] Msg or Conv not found for emission. MsgId: ${message.id}`,
        );
        return;
      }

      // 2. Delegate to Standard Socket Emitter
      // Extract active ticket ID if present
      const activeTicketId = (
        fullConversation as unknown as { tickets: { id: string }[] }
      ).tickets?.[0]?.id;

      this.socketEmitter.emitMessageReceived(
        fullMessage,
        fullConversation,
        activeTicketId, // ✅ Pass ticketId if found
      );

      Logger.info(
        `[SocketSubscriber] ✅ Emitted socket events for ${message.id}`,
      );
    } catch (error) {
      Logger.error("[SocketSubscriber] ❌ Failed to emit socket event:", error);
    }
  }
}

// Initialize subscriber
export const messageSocketSubscriber = new MessageSocketSubscriber(
  DomainEventBus.getInstance(),
);
