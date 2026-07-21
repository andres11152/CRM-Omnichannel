import { Ticket, User } from "@prisma/client";
import { ConversationSocketEmitter } from "./ConversationSocketEmitter";
import { MessageSocketEmitter } from "./MessageSocketEmitter";
import {
  ISocketGateway,
  ConversationWithRelations,
  MessageWithSender,
} from "./SocketEventFormatter";

// Re-export types so that consumers importing from here do not break.
export {
  ISocketGateway,
  ConversationWithRelations,
  MessageWithSender,
};

export class SocketEventEmitter {
  private conversationEmitter: ConversationSocketEmitter;
  private messageEmitter: MessageSocketEmitter;

  constructor(private readonly socketGateway: ISocketGateway) {
    this.conversationEmitter = new ConversationSocketEmitter(socketGateway);
    this.messageEmitter = new MessageSocketEmitter(socketGateway);
  }

  emitConversationCreated(conversation: ConversationWithRelations): void {
    this.conversationEmitter.emitConversationCreated(conversation);
  }

  emitConversationUpdated(conversation: ConversationWithRelations): void {
    this.conversationEmitter.emitConversationUpdated(conversation);
  }

  emitMessageReceived(
    message: MessageWithSender,
    conversation: ConversationWithRelations,
    ticketId?: string,
  ): void {
    this.messageEmitter.emitMessageReceived(message, conversation, ticketId);
  }

  emitMessageSent(
    message: MessageWithSender,
    conversation: ConversationWithRelations,
    ticketId?: string,
  ): void {
    this.messageEmitter.emitMessageSent(message, conversation, ticketId);
  }

  emitMessageStatus(
    messageId: string,
    conversationId: string,
    companyId: string,
    status: "sent" | "delivered" | "read" | "failed" | "queued",
    ticketId?: string,
  ): void {
    this.messageEmitter.emitMessageStatus(messageId, conversationId, companyId, status, ticketId);
  }

  emitConversationAssigned(
    conversation: ConversationWithRelations,
    assignedTo: User,
  ): void {
    this.conversationEmitter.emitConversationAssigned(conversation, assignedTo);
  }

  emitTicketCreated(ticket: Ticket): void {
    this.conversationEmitter.emitTicketCreated(ticket);
  }

  emitConversationClosed(conversation: ConversationWithRelations): void {
    this.conversationEmitter.emitConversationClosed(conversation);
  }

  emitMessageRevoked(
    messageId: string,
    conversationId: string,
    companyId: string,
  ): void {
    this.messageEmitter.emitMessageRevoked(messageId, conversationId, companyId);
  }

  emitMessageDeleted(
    messageId: string,
    conversationId: string,
    companyId: string,
  ): void {
    this.messageEmitter.emitMessageDeleted(messageId, conversationId, companyId);
  }

  emitConversationTyping(
    conversationId: string,
    companyId: string,
    from: string, // Phone number/Name
    status: "composing" | "recording" | "paused",
  ): void {
    this.conversationEmitter.emitConversationTyping(conversationId, companyId, from, status);
  }

  emitMessageReaction(
    messageId: string,
    conversationId: string,
    companyId: string,
    reaction: string,
    participant: string,
  ): void {
    this.messageEmitter.emitMessageReaction(messageId, conversationId, companyId, reaction, participant);
  }

  emitMessagePinned(
    messageId: string,
    conversationId: string,
    companyId: string,
    isPinned: boolean,
    content: string,
    senderId: string,
  ): void {
    this.messageEmitter.emitMessagePinned(messageId, conversationId, companyId, isPinned, content, senderId);
  }

  emitSystemWarning(
    conversationId: string,
    companyId: string,
    warning: string,
  ): void {
    this.conversationEmitter.emitSystemWarning(conversationId, companyId, warning);
  }
}
