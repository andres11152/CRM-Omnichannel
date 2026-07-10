/**
 *  TICKET SERVICE (Refactored)
 *
 * Core ticket CRUD operations with enrichment delegated to TicketEnrichment.
 * Handles: create, getAll, getById, update, delete.
 * Update side-effects are delegated to TicketTransitionManager and TicketNotificationService.
 */

import { Prisma, TicketStatus, TicketPriority, User } from "@prisma/client";
import { ticketRepository } from "@/repositories/TicketRepository";
import { userRepository } from "@/repositories/UserRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { ticketSyncService } from "./TicketSyncService";
import { Logger } from "@/utils/logger";
import { toTicketDTO, TicketDTO, TicketWithRelations } from "@/types/ticket.types";
import { AppError } from "@/utils/AppError";
import { ticketEnrichment } from "./tickets/TicketEnrichment";
import { ticketTransitionManager } from "./tickets/TicketTransitionManager";
import { ticketNotificationService } from "./tickets/TicketNotificationService";
import { webhookDispatcher } from "@/services/WebhookDispatcher";
import { WebhookEvents } from "@/types/types";

class TicketService {
  /**
   * Enrich TicketDTOs with CRM Contact Data AND WhatsApp Session Index
   * (Delegated to TicketEnrichment)
   */
  async enrichWithCrmData(dtos: TicketDTO[], companyId: string): Promise<TicketDTO[]> {
    return ticketEnrichment.enrichWithCrmData(dtos, companyId);
  }

  async createTicket(data: {
    companyId: string;
    userId: string;
    subject: string;
    description?: string;
    priority?: TicketPriority;
    status?: TicketStatus;
    queueId?: string;
    assignedToId?: string;
  }): Promise<TicketDTO> {
    const lastTicket = await ticketRepository.findFirst({
      orderBy: { ticketNumber: "desc" },
      select: { ticketNumber: true },
    });
    const nextNumber = (lastTicket?.ticketNumber || 0) + 1;

    const ticket = await ticketRepository.create({
      data: {
        company: { connect: { id: data.companyId } },
        createdBy: { connect: { id: data.userId } },
        subject: data.subject,
        description: data.description,
        priority: data.priority || "MEDIUM",
        status: data.status || "OPEN",
        ticketNumber: nextNumber,
        queue: data.queueId ? { connect: { id: data.queueId } } : undefined,
        assignedTo: data.assignedToId ? { connect: { id: data.assignedToId } } : undefined,
      },
      include: {
        createdBy: true,
        assignedTo: true,
        queue: true,
        conversation: {
          include: {
            participants: true,
            contact: true,
            messages: { take: 1, orderBy: { createdAt: "desc" } },
          },
        },
      },
    });

    const dto = toTicketDTO(ticket as TicketWithRelations);
    await ticketNotificationService.notifyTicketCreated(data.companyId, dto);

    // [WEBHOOK] Dispatch ticket.created event
    void webhookDispatcher.dispatch(data.companyId, WebhookEvents.TICKET_CREATED, {
      id: dto.id,
      ticketNumber: dto.ticketNumber,
      subject: dto.subject,
      priority: dto.priority,
      status: dto.status,
      assignedToId: dto.assignedTo?.id || null,
    });

    return dto;
  }

  async getAllTickets(data: {
    companyId: string;
    userId: string;
    userRole: string;
    status?: string | TicketStatus;
    priority?: string | TicketPriority;
    queueId?: string;
    assignedToId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: TicketDTO[]; meta: { total: number; page: number; limit: number; pages: number } }> {
    const page = Number(data.page) || 1;
    const limit = Number(data.limit) || 50;
    const skip = (page - 1) * limit;

    const where: Prisma.TicketWhereInput = {
      companyId: data.companyId,
      deletedAt: null,
      conversation: { is: { isGroup: false } },
    };

    if (data.status) where.status = data.status as TicketStatus;
    if (data.priority) where.priority = data.priority as TicketPriority;
    if (data.queueId) where.queueId = data.queueId;
    if (data.assignedToId) where.assignedToId = data.assignedToId;

    if (data.userRole === "AGENT") {
      const user = (await userRepository.findFirst({
        where: { id: data.userId },
        include: { queues: { select: { id: true } } },
      })) as (User & { queues: { id: string }[] }) | null;

      const queueIds = user?.queues?.map((q) => q.id) || [];

      where.OR = [
        { assignedToId: data.userId },
        { queueId: { in: queueIds } },
        { assignedToId: null, queueId: null },
      ];
    }

    const [total, tickets] = await Promise.all([
      ticketRepository.count({ where }),
      ticketRepository.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          createdBy: true,
          assignedTo: true,
          queue: true,
          conversation: {
            include: {
              participants: true,
              contact: true,
              messages: { take: 1, orderBy: { createdAt: "desc" } },
            },
          },
        },
      }),
    ]);

    const dtos = tickets.map((t) => toTicketDTO(t as TicketWithRelations));
    const enriched = await this.enrichWithCrmData(dtos, data.companyId);

    return {
      data: enriched,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getTicketById(
    ticketId: string,
    companyId: string,
    userId: string,
    _userRole: string,
  ): Promise<TicketDTO> {
    const include = {
      createdBy: true,
      assignedTo: true,
      queue: true,
      conversation: {
        include: {
          participants: true,
          contact: true,
          messages: { take: 1, orderBy: { createdAt: "desc" } as const },
        },
      },
    };

    let ticket = await ticketRepository.findUnique({
      where: { id: ticketId },
      include,
    });

    // [RACE FIX] Same lazy-ticket race as updateTicket: a conversation synced
    // in (live inbound or history sync) has no Ticket row until someone acts
    // on it. A GET before any PATCH — e.g. opening a just-synced chat — must
    // materialize the ticket too, or it reproduces the "ya no existe" 404
    // on the read path instead of the write path.
    if (!ticket) {
      const conversation = await conversationRepository.findFirst({
        where: { id: ticketId, companyId },
      });
      if (conversation && !conversation.isGroup) {
        await ticketSyncService.ensureActiveTicket({
          companyId,
          conversationId: conversation.id,
          agentId: userId,
          subject: conversation.subject || "Nueva conversación",
          description: "Ticket creado al abrir la conversación",
        });
        ticket = await ticketRepository.findFirst({
          where: { conversationId: conversation.id },
          include,
        });
      }
    }

    if (!ticket || ticket.deletedAt) throw new AppError("Ticket not found", 404);
    if (ticket.companyId !== companyId) throw new AppError("Permission denied", 403);

    const dto = toTicketDTO(ticket as TicketWithRelations);
    const [enriched] = await this.enrichWithCrmData([dto], companyId);
    return enriched;
  }

  async updateTicket(
    ticketId: string,
    companyId: string,
    updaterId: string,
    updaterName: string,
    data: Record<string, unknown>,
  ): Promise<TicketDTO> {
    let existingTicket = await ticketRepository.findUnique({ where: { id: ticketId } });

    if (!existingTicket) {
      const ticketByConv = await ticketRepository.findFirst({
        where: { conversationId: ticketId },
      });
      if (ticketByConv) {
        existingTicket = ticketByConv;
        ticketId = ticketByConv.id;
      }
    }

    // [RACE FIX] Taking a just-arrived ticket. A fresh inbound message creates the
    // CONVERSATION, but its Ticket row is materialized on-demand — so if the agent
    // clicks fast, the ticket may not exist yet and the id passed is actually the
    // conversationId. If that conversation exists, create the ticket now (idempotent,
    // distributed-locked) instead of failing with "Ticket not found (ya no existe)".
    if (!existingTicket) {
      const conversation = await conversationRepository.findFirst({
        where: { id: ticketId, companyId },
      });
      if (conversation && !conversation.isGroup) {
        await ticketSyncService.ensureActiveTicket({
          companyId,
          conversationId: conversation.id,
          agentId: updaterId,
          subject: conversation.subject || "Nueva conversación",
          description: "Ticket creado al atender la conversación",
        });
        existingTicket = await ticketRepository.findFirst({
          where: { conversationId: conversation.id },
        });
        if (existingTicket) ticketId = existingTicket.id;
      }
    }

    if (!existingTicket) throw new AppError("Ticket not found", 404);
    if (existingTicket.companyId !== companyId) throw new AppError("Permission denied", 403);

    const updateData = await ticketTransitionManager.evaluateStatusTransitions(existingTicket, data);

    let updatedTicket;
    try {
      updatedTicket = await ticketRepository.update({
        where: { id: ticketId },
        data: updateData,
        include: {
          createdBy: true,
          assignedTo: true,
          queue: true,
          conversation: {
            include: {
              participants: true,
              contact: true,
              messages: { take: 1, orderBy: { createdAt: "desc" } },
            },
          },
        },
      });
    } catch (error: unknown) {
      const prismaError = error as { code?: string };
      if (prismaError?.code === "P2003") throw new AppError("Invalid Queue ID or User ID", 400);
      throw error;
    }

    await ticketTransitionManager.triggerAutoAssignment(updatedTicket.companyId, updatedTicket.id, updatedTicket.queueId, updatedTicket.assignedToId);
    await ticketTransitionManager.syncConversation({ companyId: updatedTicket.companyId, conversationId: updatedTicket.conversationId }, data);
    await ticketTransitionManager.handleSpamAction(updaterId, { id: updatedTicket.id, companyId: updatedTicket.companyId, conversationId: updatedTicket.conversationId }, data);

    // Hito #7: Create a handover note whisper if provided
    if (data.handoverNote && typeof data.handoverNote === "string") {
      const noteContent = `📋 *Nota de Traspaso*:\n${data.handoverNote}`;
      try {
        const { messageRepository } = await import("@/repositories/MessageRepository");
        const { gateway } = await import("@/gateways/socketGateway");
        const { SocketEventEmitter } = await import("./SocketEventEmitter");
        const socketEmitter = new SocketEventEmitter(gateway);

        const savedMessage = await messageRepository.create({
          data: {
            companyId,
            conversationId: updatedTicket.conversationId,
            content: noteContent,
            direction: "OUTBOUND",
            senderId: updaterId,
            channel: updatedTicket.conversation.channel,
            status: "SENT",
            metadata: {
              isWhisper: true,
            },
          },
          include: {
            sender: true,
          }
        });

        const convWithRels = await conversationRepository.findFirst({
          where: { id: updatedTicket.conversationId, companyId },
          include: {
            participants: true,
            assignedTo: true,
            contact: true,
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
            }
          }
        });

        if (convWithRels) {
          socketEmitter.emitMessageSent(savedMessage, convWithRels, updatedTicket.id);
        }
      } catch (err) {
        Logger.error(`[TicketService] Failed to create handover note whisper`, err);
      }
    }

    const rawTicketDto = toTicketDTO(updatedTicket as TicketWithRelations);
    const [ticketDto] = await this.enrichWithCrmData([rawTicketDto], companyId);

    await ticketNotificationService.notifyTicketUpdated(
      updatedTicket.companyId,
      ticketDto,
      Object.keys(updateData),
      existingTicket.assignedToId,
      updatedTicket.assignedToId,
      updaterName,
      updaterId,
      {
        id: updatedTicket.id,
        ticketNumber: updatedTicket.ticketNumber,
        subject: updatedTicket.subject,
        conversationId: updatedTicket.conversationId
      }
    );

    if (updatedTicket.conversationId) {
      await ticketNotificationService.notifyConversationUpdated(
        updatedTicket.companyId, 
        updatedTicket.conversationId, 
        {
          ticketId: updatedTicket.id,
          queueId: updatedTicket.queueId,
          assignedToId: updatedTicket.assignedToId,
          contact: {
            ...ticketDto.contact, // Use ENRICHED contact data!
            queueName: updatedTicket.queue?.name,
            assignedAgentName: updatedTicket.assignedTo?.name,
            assignedAgentId: updatedTicket.assignedToId,
          },
        });
    }

    // [WEBHOOK] Dispatch ticket events based on what changed
    if (data.status && existingTicket.status !== updatedTicket.status) {
      void webhookDispatcher.dispatch(companyId, WebhookEvents.TICKET_STATUS_CHANGED, {
        id: updatedTicket.id,
        ticketNumber: updatedTicket.ticketNumber,
        previousStatus: existingTicket.status,
        newStatus: updatedTicket.status,
        subject: updatedTicket.subject,
      });
    }
    if (existingTicket.assignedToId !== updatedTicket.assignedToId) {
      void webhookDispatcher.dispatch(companyId, WebhookEvents.TICKET_ASSIGNED, {
        id: updatedTicket.id,
        ticketNumber: updatedTicket.ticketNumber,
        previousAgentId: existingTicket.assignedToId,
        newAgentId: updatedTicket.assignedToId,
        agentName: updatedTicket.assignedTo?.name || null,
      });
    }

    return ticketDto;
  }

  async deleteTicket(ticketId: string, companyId: string, userId: string): Promise<void> {
    const ticket = await ticketRepository.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.deletedAt) throw new AppError("Ticket not found", 404);
    if (ticket.companyId !== companyId) throw new AppError("Permission denied", 403);

    await ticketRepository.update({
      where: { id: ticketId },
      data: {
        deletedAt: new Date(),
        deletedBy: userId || "system",
        status: "CLOSED",
      },
    });

    await ticketNotificationService.notifyTicketDeleted(companyId, ticketId, ticket.assignedToId);
  }
}

export const ticketService = new TicketService();
