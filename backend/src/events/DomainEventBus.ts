import { EventEmitter } from "events";
import { Message } from "@prisma/client";

export enum DomainEventType {
  MESSAGE_RECEIVED = "message.received",
  MESSAGE_SENT = "message.sent",
  CONVERSATION_CREATED = "conversation.created",
}

export interface MessageReceivedEvent {
  message: Message;
  companyId: string;
  conversationId: string;
  senderId: string;
}

export class DomainEventBus extends EventEmitter {
  private static instance: DomainEventBus;

  private constructor() {
    super();
  }

  static getInstance(): DomainEventBus {
    if (!DomainEventBus.instance) {
      DomainEventBus.instance = new DomainEventBus();
    }
    return DomainEventBus.instance;
  }

  publish(event: DomainEventType, payload: any) {
    this.emit(event, payload);
  }
}

export const domainEventBus = DomainEventBus.getInstance();
