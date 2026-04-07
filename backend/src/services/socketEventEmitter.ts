/**
 * [SOUND] SOCKET EVENT EMITTER
 *
 * Centralized service for emitting real-time events via Socket.IO
 *
 * Follows SOLID principles:
 * - Single Responsibility: Only emits socket events
 * - Open/Closed: Extensible for new event types
 * - Interface Segregation: Specific methods for each event type
 * - Dependency Inversion: Depends on SocketGateway interface
 *
 * Event Naming Convention:
 * - `conversation.created` - New conversation started
 * - `conversation.updated` - Conversation metadata changed
 * - `message.received` - New message from customer
 * - `message.sent` - New message from agent
 * - `message.status` - Message delivery status changed
 */

import { Conversation, Message, User, Ticket } from "@prisma/client";
import { Logger } from "@/utils/logger";

// Types for expanded relations
type ConversationWithRelations = Conversation & {
  participants?: User[];
  assignedTo?: User | null;
  messages?: Message[];
  unreadCount?: number | null; // Explicitly allowed for type safety
};

type MessageWithSender = Message & {
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
  ): void; // Optional
  emitToRoom?(room: string, event: string, data: Record<string, unknown>): void;
}

export class SocketEventEmitter {
  constructor(private readonly socketGateway: ISocketGateway) {}

  /**
   * Emit when new conversation is created
   *
   * Frontend: Adds to conversation list in real-time
   */
  emitConversationCreated(conversation: ConversationWithRelations): void {
    Logger.info(
      `[SocketEvents] [SOUND] Emitting conversation.created: ${conversation.id}`,
    );

    this.socketGateway.emitToCompany(
      conversation.companyId,
      "conversation.created",
      {
        conversation: this.formatConversation(conversation),
        timestamp: new Date().toISOString(),
      },
    );
  }

  /**
   * Emit when conversation is updated
   *
   * Frontend: Updates conversation metadata (status, assignment, etc.)
   */
  emitConversationUpdated(conversation: ConversationWithRelations): void {
    Logger.info(
      `[SocketEvents] [SOUND] Emitting conversation.updated: ${conversation.id}`,
    );

    this.socketGateway.emitToCompany(
      conversation.companyId,
      "conversation.updated",
      {
        conversation: this.formatConversation(conversation),
        timestamp: new Date().toISOString(),
      },
    );
  }

  /**
   * Emit when message is received from customer
   *
   * Frontend: Adds message to chat + updates conversation preview
   */
  emitMessageReceived(
    message: MessageWithSender,
    conversation: ConversationWithRelations,
    ticketId?: string,
  ): void {
    Logger.info(`[SocketEvents] [SOUND] Emitting message.received: ${message.id}`);

    // 1. Emit for Active Chat (ChatInterface)
    // Frontend expects 'conversation.new_message'
    const messagePayload = this.formatMessage(message);

    this.socketGateway.emitToCompany(
      conversation.companyId,
      "conversation.new_message",
      messagePayload,
    );
    if (this.socketGateway.emitToRoom) {
      this.socketGateway.emitToRoom(
        conversation.id,
        "conversation.new_message",
        messagePayload,
      );
    }

    // 2. Emit for Chat List (AgentWorkspace)
    // Frontend expects 'conversation.updated' with lastMessage info
    this.socketGateway.emitToCompany(
      conversation.companyId,
      "conversation.updated",
      {
        id: conversation.id,
        ...this.formatConversation(conversation),
        lastMessage: message.content,
        lastMessageAt: message.createdAt.toISOString(),
        // unreadCount is now provided by formatConversation
      },
    );

    // 3. Legacy / Compatibility
    this.socketGateway.emitToCompany(
      conversation.companyId,
      "message.received",
      {
        ticketId, // [OK] CRITICAL FIX: Frontend expects this at root
        message: messagePayload,
        conversation: this.formatConversation(conversation),
        timestamp: new Date().toISOString(),
      },
    );
  }

  /**
   * Emit when agent sends message
   *
   * Frontend: Confirms message was sent successfully
   */
  emitMessageSent(
    message: MessageWithSender,
    conversation: ConversationWithRelations,
    ticketId?: string,
  ): void {
    Logger.info(`[SocketEvents] [SOUND] Emitting message.sent: ${message.id}`);

    const messagePayload = this.formatMessage(message);

    // 1. Unified Message Event
    this.socketGateway.emitToCompany(
      conversation.companyId,
      "conversation.new_message",
      messagePayload,
    );
    if (this.socketGateway.emitToRoom) {
      this.socketGateway.emitToRoom(
        conversation.id,
        "conversation.new_message",
        messagePayload,
      );
    }

    // 2. Update Conversation List
    this.socketGateway.emitToCompany(
      conversation.companyId,
      "conversation.updated",
      {
        id: conversation.id,
        ...this.formatConversation(conversation),
        lastMessage: message.content,
        lastMessageAt: message.createdAt.toISOString(),
      },
    );

    // 3. Legacy
    this.socketGateway.emitToCompany(conversation.companyId, "message.sent", {
      ticketId, // [OK] CRITICAL FIX: Include ticketId
      message: messagePayload,
      conversation: this.formatConversation(conversation),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit when message delivery status changes
   *
   * Frontend: Updates message status indicator (, , blue checkmarks)
   */
  emitMessageStatus(
    messageId: string,
    conversationId: string,
    companyId: string,
    status: "sent" | "delivered" | "read" | "failed",
  ): void {
    Logger.info(
      `[SocketEvents] [SOUND] Emitting message.status: ${messageId} → ${status}`,
    );

    this.socketGateway.emitToCompany(companyId, "message.status", {
      messageId,
      conversationId,
      status,
      timestamp: new Date().toISOString(),
    });
    if (this.socketGateway.emitToRoom) {
      this.socketGateway.emitToRoom(conversationId, "message.status", {
        messageId,
        conversationId,
        status,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Emit when conversation is assigned to agent
   *
   * Frontend: Shows assignment notification
   */
  emitConversationAssigned(
    conversation: ConversationWithRelations,
    assignedTo: User,
  ): void {
    Logger.info(
      `[SocketEvents] [SOUND] Emitting conversation.assigned: ${conversation.id} → ${assignedTo.name}`,
    );

    this.socketGateway.emitToCompany(
      conversation.companyId,
      "conversation.assigned",
      {
        conversation: this.formatConversation(conversation),
        assignedTo: {
          id: assignedTo.id,
          name: assignedTo.name,
          email: assignedTo.email,
        },
        timestamp: new Date().toISOString(),
      },
    );
  }

  /**
   * Emit when ticket is created
   *
   * Frontend: Shows new ticket notification
   */
  emitTicketCreated(ticket: Ticket): void {
    Logger.info(`[SocketEvents] [SOUND] Emitting ticket.created: ${ticket.id}`);

    this.socketGateway.emitToCompany(
      ticket.companyId,
      "ticket.created",
      ticket as unknown as Record<string, unknown>, // Adapter needs explicit object
    );
  }

  /**
   * Emit when conversation is closed
   *
   * Frontend: Moves conversation to "closed" section
   */
  emitConversationClosed(conversation: ConversationWithRelations): void {
    Logger.info(
      `[SocketEvents] [SOUND] Emitting conversation.closed: ${conversation.id}`,
    );

    this.socketGateway.emitToCompany(
      conversation.companyId,
      "conversation.closed",
      {
        conversation: this.formatConversation(conversation),
        timestamp: new Date().toISOString(),
      },
    );
  }

  /**
   * Emit when a message is revoked ("Delete for Everyone")
   *
   * Frontend: Replaces message bubble with "[Mensaje eliminado]" indicator
   */
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
      this.socketGateway.emitToRoom(conversationId, "message.revoked", payload);
    }
  }

  /**
   * Emit when a client is typing on WhatsApp
   *
   * Frontend: Shows "Typing..." indicator in chat
   */
  emitConversationTyping(
    conversationId: string,
    companyId: string,
    from: string, // Phone number/Name
    status: "composing" | "recording" | "paused",
  ): void {
    // 1. Emit to Company Room (All agents see it)
    this.socketGateway.emitToCompany(companyId, "conversation:typing", {
      conversationId,
      from,
      status,
    });
  }

  /**
   * Emit when a message receives a reaction (emoji)
   *
   * Frontend: Shows the emoji on the message bubble
   */
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
        conversationId,
        "message.reaction",
        payload,
      );
    }
  }

  /**
   * Format conversation for client consumption
   * Removes sensitive data, normalizes structure, and maps contact info
   */
  private formatConversation(conversation: ConversationWithRelations) {
    const lastMessage = conversation.messages?.[0];

    //  LOGIC: Identify the Customer (Contact)
    // The participant that is NOT the agent/admin/system
    // Fallback: Use the one matching channelId if participants list is weird
    const customerParticipant = conversation.participants?.find(
      (p) => p.role === "USER" || p.phone === conversation.channelId,
    );

    const contact = customerParticipant
      ? {
          id: customerParticipant.id,
          name: customerParticipant.name || customerParticipant.phone,
          phone: customerParticipant.phone,
          email: customerParticipant.email,
          profilePicUrl: customerParticipant.profilePicUrl,
          about: customerParticipant.about,
          role: customerParticipant.role,
          channelId: conversation.channelId,
        }
      : null;

    return {
      id: conversation.id,
      companyId: conversation.companyId,
      channelId: conversation.channelId,
      subject: conversation.subject,
      status: conversation.status,
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
        role: p.role, // Important for frontend filtering
      })),
      contact: contact, // [OK] FIX: Explicitly provide contact object for Frontend
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
      // [OFFLINE] Badge Logic: Include database value (defaults to 0)
      unreadCount: conversation.unreadCount || 0,
    };
  }

  /**
   * Format message for client consumption
   */
  private formatMessage(message: MessageWithSender) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      content: message.content,
      direction: message.direction,
      status: message.status,
      mediaType:
        (message as unknown as Record<string, unknown>).mediaType || null,
      mediaUrl:
        (message as unknown as Record<string, unknown>).mediaUrl || null,
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
