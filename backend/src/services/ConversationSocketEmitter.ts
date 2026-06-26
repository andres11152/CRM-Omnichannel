import { Ticket, User } from "@prisma/client";
import { Logger } from "@/utils/logger";
import {
  ISocketGateway,
  ConversationWithRelations,
  SocketEventFormatter,
} from "./SocketEventFormatter";

export class ConversationSocketEmitter {
  constructor(private readonly socketGateway: ISocketGateway) {}

  emitConversationCreated(conversation: ConversationWithRelations): void {
    Logger.info(
      `[SocketEvents] [SOUND] Emitting conversation.created: ${conversation.id}`,
    );

    this.socketGateway.emitToCompany(
      conversation.companyId,
      "conversation.created",
      {
        conversation: SocketEventFormatter.formatConversation(conversation),
        timestamp: new Date().toISOString(),
      },
    );
  }

  emitConversationUpdated(conversation: ConversationWithRelations): void {
    Logger.info(
      `[SocketEvents] [SOUND] Emitting conversation.updated: ${conversation.id}`,
    );

    this.socketGateway.emitToCompany(
      conversation.companyId,
      "conversation.updated",
      {
        conversation: SocketEventFormatter.formatConversation(conversation),
        timestamp: new Date().toISOString(),
      },
    );
  }

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
        conversation: SocketEventFormatter.formatConversation(conversation),
        assignedTo: {
          id: assignedTo.id,
          name: assignedTo.name,
          email: assignedTo.email,
        },
        timestamp: new Date().toISOString(),
      },
    );
  }

  emitConversationClosed(conversation: ConversationWithRelations): void {
    Logger.info(
      `[SocketEvents] [SOUND] Emitting conversation.closed: ${conversation.id}`,
    );

    this.socketGateway.emitToCompany(
      conversation.companyId,
      "conversation.closed",
      {
        conversation: SocketEventFormatter.formatConversation(conversation),
        timestamp: new Date().toISOString(),
      },
    );
  }

  emitConversationTyping(
    conversationId: string,
    companyId: string,
    from: string,
    status: "composing" | "recording" | "paused",
  ): void {
    this.socketGateway.emitToCompany(companyId, "conversation:typing", {
      conversationId,
      from,
      status,
    });
  }

  emitSystemWarning(
    conversationId: string,
    companyId: string,
    warning: string,
  ): void {
    Logger.warn(`[SocketEvents] [WARN] system.warning for conv ${conversationId}: ${warning}`);

    const payload = {
      conversationId,
      warning,
      timestamp: new Date().toISOString(),
    };

    this.socketGateway.emitToCompany(companyId, "system.warning", payload);
    if (this.socketGateway.emitToRoom) {
      this.socketGateway.emitToRoom(`conversation:${conversationId}`, "system.warning", payload);
    }
  }

  emitTicketCreated(ticket: Ticket): void {
    Logger.info(`[SocketEvents] [SOUND] Emitting ticket.created: ${ticket.id}`);

    this.socketGateway.emitToCompany(
      ticket.companyId,
      "ticket.created",
      ticket as unknown as Record<string, unknown>,
    );
  }
}
