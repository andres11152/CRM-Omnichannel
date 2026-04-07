/**
 *  TICKET SERVICE (Refactored)
 *
 * Core ticket CRUD operations with enrichment delegated to TicketEnrichment.
 * Handles: create, getAll, getById, update (with status transitions,
 * auto-assignment, SPAM blocking, socket notifications), delete.
 */

import {
  Prisma,
  TicketStatus,
  TicketPriority,
  TicketResolutionType,
  ConversationStatus,
} from "@prisma/client";
import { ticketRepository } from "@/repositories/TicketRepository";
import { contactRepository } from "@/repositories/ContactRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { userRepository } from "@/repositories/UserRepository";
import { notificationRepository } from "@/repositories/NotificationRepository";
import { gateway } from "@/gateways/socketGateway";
// webhookDispatcher import removed due to unused
import { Logger } from "@/utils/logger";
import {
  toTicketDTO,
  TicketDTO,
  TicketWithRelations,
} from "@/types/ticket.types";
import { AppError } from "@/utils/AppError";
import { ticketEnrichment } from "./tickets/TicketEnrichment";

class TicketService {
  /**
   * Enrich TicketDTOs with CRM Contact Data AND WhatsApp Session Index
   * (Delegated to TicketEnrichment)
   */
  async enrichWithCrmData(
    dtos: TicketDTO[],
    companyId: string,
  ): Promise<TicketDTO[]> {
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
      where: { companyId: data.companyId },
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
        ...(data.queueId && { queue: { connect: { id: data.queueId } } }),
        ...(data.assignedToId && {
          assignedTo: { connect: { id: data.assignedToId } },
        }),
      },
      include: {
        createdBy: true,
        assignedTo: true,
        queue: true,
        conversation: {
          include: {
            participants: true,
            messages: { take: 1, orderBy: { createdAt: "desc" } },
          },
        },
      },
    });

    const dto = toTicketDTO(ticket as unknown as TicketWithRelations);

    try {
      gateway.emitToCompany(data.companyId, "ticket.created", { ticket: dto });
    } catch (e) {
      Logger.error("[TicketService] Socket emit failed:", e);
    }

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
  }): Promise<TicketDTO[]> {
    const where: Prisma.TicketWhereInput = {
      companyId: data.companyId,
      deletedAt: null,
    };

    if (data.status) where.status = data.status as TicketStatus;
    if (data.priority) where.priority = data.priority as TicketPriority;
    if (data.queueId) where.queueId = data.queueId;
    if (data.assignedToId) where.assignedToId = data.assignedToId;

    if (data.userRole === "AGENT") {
      const user = await userRepository.findFirst({
        where: { id: data.userId },
        include: { queues: { select: { id: true } } },
      });

      const queueIds =
        (
          user as unknown as {
            queues: { id: string }[];
          } | null
        )?.queues?.map((q) => q.id) || [];

      where.OR = [
        { assignedToId: data.userId },
        { queueId: { in: queueIds } },
        { assignedToId: null, queueId: null },
      ];
    }

    const tickets = await ticketRepository.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: true,
        assignedTo: true,
        queue: true,
        conversation: {
          include: {
            participants: true,
            messages: { take: 1, orderBy: { createdAt: "desc" } },
          },
        },
      },
    });

    const dtos = tickets.map((t) =>
      toTicketDTO(t as unknown as TicketWithRelations),
    );

    return this.enrichWithCrmData(dtos, data.companyId);
  }

  async getTicketById(
    ticketId: string,
    companyId: string,
    _userId: string,
    _userRole: string,
  ): Promise<TicketDTO> {
    const ticket = await ticketRepository.findUnique({
      where: { id: ticketId },
      include: {
        createdBy: true,
        assignedTo: true,
        queue: true,
        conversation: {
          include: {
            participants: true,
            messages: { take: 1, orderBy: { createdAt: "desc" } },
          },
        },
      },
    });

    if (!ticket || ticket.deletedAt)
      throw new AppError("Ticket not found", 404);
    if (ticket.companyId !== companyId)
      throw new AppError("Permission denied", 403);

    const dto = toTicketDTO(ticket as unknown as TicketWithRelations);
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
    let existingTicket = await ticketRepository.findUnique({
      where: { id: ticketId },
    });

    if (!existingTicket) {
      const ticketByConv = await ticketRepository.findFirst({
        where: { conversationId: ticketId, companyId },
      });
      if (ticketByConv) {
        existingTicket = ticketByConv;
        ticketId = ticketByConv.id;
      }
    }

    if (!existingTicket) throw new AppError("Ticket not found", 404);
    if (existingTicket.companyId !== companyId)
      throw new AppError("Permission denied", 403);

    const updateData: Prisma.TicketUpdateInput = {};

    if (data.status === "RESOLVED" || data.status === "CLOSED") {
      if (
        existingTicket.status !== "RESOLVED" &&
        existingTicket.status !== "CLOSED"
      ) {
        updateData.resolvedAt = new Date();
      }
    } else if (data.status === "OPEN" || data.status === "IN_PROGRESS") {
      if (
        existingTicket.status === "RESOLVED" ||
        existingTicket.status === "CLOSED"
      ) {
        // Enterprise: Reset resolution audit if reopened
        updateData.resolvedAt = null;
        updateData.resolutionType = null as unknown as TicketResolutionType; 
        updateData.resolutionNotes = null as unknown as string;
      }
    }

    if (data.subject !== undefined) updateData.subject = data.subject as string;
    if (data.description !== undefined)
      updateData.description = data.description as string;
    if (data.priority !== undefined)
      updateData.priority = data.priority as TicketPriority;
    if (data.status !== undefined)
      updateData.status = data.status as TicketStatus;

    if (data.queueId !== undefined) {
      updateData.queue = data.queueId
        ? { connect: { id: data.queueId as string } }
        : { disconnect: true };
    }

    if (data.assignedToId !== undefined) {
      updateData.assignedTo = data.assignedToId
        ? { connect: { id: data.assignedToId as string } }
        : { disconnect: true };
      if (data.status === undefined) {
        updateData.status = data.assignedToId ? "IN_PROGRESS" : "OPEN";
      }
    }

    if (data.resolvedAt !== undefined)
      updateData.resolvedAt = data.resolvedAt as Date;
    if (data.resolutionType !== undefined)
      updateData.resolutionType = data.resolutionType as TicketResolutionType;
    if (data.resolutionNotes !== undefined)
      updateData.resolutionNotes = data.resolutionNotes as string;

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
              messages: { take: 1, orderBy: { createdAt: "desc" } },
            },
          },
        },
      });
    } catch (error: unknown) {
      const prismaError = error as { code?: string };
      if (prismaError?.code === "P2003")
        throw new AppError("Invalid Queue ID or User ID", 400);
      throw error;
    }

    // Auto-assignment if routed to queue without agent
    if (data.queueId && updatedTicket.queueId && !updatedTicket.assignedToId) {
      try {
        const { assignTicketToAgent } =
          await import("@/services/AutoAssignmentService");
        await assignTicketToAgent(updatedTicket.id, updatedTicket.queueId);
      } catch (error) {
        Logger.error("[TicketService] Auto-assignment failed:", error);
      }
    }

    // Sync Conversation Queue & Assignment
    if (updatedTicket.conversationId) {
      const syncData: Prisma.ConversationUpdateInput = {};
      let needsSync = false;

      if (data.queueId !== undefined) {
        syncData.queue = data.queueId
          ? { connect: { id: data.queueId as string } }
          : { disconnect: true };
        needsSync = true;
      }
      if (data.assignedToId !== undefined) {
        syncData.assignedTo = data.assignedToId
          ? { connect: { id: data.assignedToId as string } }
          : { disconnect: true };
        needsSync = true;
      }
      if (data.status !== undefined) {
        syncData.status = data.status as
          | "OPEN"
          | "IN_PROGRESS"
          | "RESOLVED"
          | "CLOSED";
        needsSync = true;
        if (data.status === "RESOLVED" || data.status === "CLOSED")
          syncData.resolvedAt = new Date();
      }

      if (needsSync) {
        const uncheckedSyncData: Prisma.ConversationUncheckedUpdateInput = {};
        
        if (data.status !== undefined) {
          uncheckedSyncData.status = data.status as ConversationStatus;
          if (data.status === "RESOLVED" || data.status === "CLOSED") {
            uncheckedSyncData.resolvedAt = new Date();
          } else {
            uncheckedSyncData.resolvedAt = null;
          }
        }
        
        if (data.queueId !== undefined) {
          uncheckedSyncData.queueId = (data.queueId as string) || null;
        }
        
        if (data.assignedToId !== undefined) {
          uncheckedSyncData.assignedToId = (data.assignedToId as string) || null;
        }

        await conversationRepository
          .updateConversation(updatedTicket.companyId, updatedTicket.conversationId, uncheckedSyncData)
          .catch((e) => Logger.error("[TicketService] sync error:", e));
      }
    }

    // SPAM handling
    if (data.resolutionType === "SPAM" && updatedTicket.conversationId) {
      try {
        const conv = await conversationRepository.findByIdAndCompanyId(
          updatedTicket.conversationId,
          updatedTicket.companyId,
        );
        if (conv?.contactId) {
          await contactRepository.update(updatedTicket.companyId, conv.contactId, {
            isBlocked: true,
            blockedAt: new Date(),
            blockedReason: "SPAM",
          });
        } else if (conv?.channelId) {
          const contact = await contactRepository.findWithDeleted(
            updatedTicket.companyId,
            conv.channelId,
          );
          if (contact) {
            await contactRepository.update(updatedTicket.companyId, contact.id, {
              isBlocked: true,
              blockedAt: new Date(),
              blockedReason: "SPAM",
            });
          }
        }
        await ticketRepository.update({
          where: { id: updatedTicket.id },
          data: { deletedAt: new Date(), deletedBy: updaterId || "system" },
        });
      } catch (error) {
        Logger.error(
          "[TicketService] Failed to auto-block SPAM contact:",
          error,
        );
      }
    }

    const rawTicketDto = toTicketDTO(
      updatedTicket as unknown as TicketWithRelations,
    );
    const [ticketDto] = await this.enrichWithCrmData([rawTicketDto], companyId);

    // Socket Notifications
    try {
      const io = gateway.getIO();
      const previousAssignee = existingTicket.assignedToId;
      const newAssignee = updatedTicket.assignedToId;

      io.to(`company:${updatedTicket.companyId}`).emit("ticket.updated", {
        ticket: ticketDto,
        changedFields: Object.keys(updateData),
      });

      const affectedAgents = new Set<string>();
      if (updatedTicket.assignedToId)
        affectedAgents.add(updatedTicket.assignedToId);
      if (previousAssignee) affectedAgents.add(previousAssignee);

      affectedAgents.forEach((agentId) => {
        io.to(`agent:${agentId}`).emit("ticket.updated", {
          ticket: ticketDto,
          changedFields: Object.keys(updateData),
        });
      });

      if (previousAssignee !== newAssignee && newAssignee !== null) {
        io.to(`agent:${newAssignee}`).emit("ticket.assigned", {
          ticket: ticketDto,
          message: `Se te ha asignado el ticket #${updatedTicket.ticketNumber}: ${updatedTicket.subject}`,
          assignedBy: updaterName || "Sistema",
          timestamp: new Date().toISOString(),
        });

        await notificationRepository
          .create({
            data: {
              companyId: updatedTicket.companyId,
              userId: newAssignee,
              type: "TICKET_ASSIGNED",
              title: `Ticket #${updatedTicket.ticketNumber} asignado`,
              message: `Se te ha asignado: ${updatedTicket.subject}`,
              link: `/tickets/${updatedTicket.id}`,
              metadata: {
                ticketId: updatedTicket.id,
                ticketNumber: updatedTicket.ticketNumber,
                conversationId: updatedTicket.conversationId,
                assignedBy: updaterId,
              } as unknown as Prisma.InputJsonValue,
              read: false,
            },
          })
          .catch((e) =>
            Logger.error("[TicketService] Notification failed:", e),
          );
      }

      if (updatedTicket.conversationId) {
        io.to(`company:${updatedTicket.companyId}`).emit(
          "conversation.updated",
          {
            id: updatedTicket.conversationId,
            ticketId: updatedTicket.id,
            queueId: updatedTicket.queueId,
            assignedToId: updatedTicket.assignedToId,
            contact: {
              queueName: updatedTicket.queue?.name,
              assignedAgentName: updatedTicket.assignedTo?.name,
              assignedAgentId: updatedTicket.assignedToId,
            },
          },
        );
      }
    } catch (e) {
      Logger.error("[TicketService] Socket emit failed:", e);
    }

    return ticketDto;
  }

  async deleteTicket(
    ticketId: string,
    companyId: string,
    userId: string,
  ): Promise<void> {
    const ticket = await ticketRepository.findUnique({
      where: { id: ticketId },
    });
    if (!ticket || ticket.deletedAt)
      throw new AppError("Ticket not found", 404);
    if (ticket.companyId !== companyId)
      throw new AppError("Permission denied", 403);

    await ticketRepository.update({
      where: { id: ticketId },
      data: {
        deletedAt: new Date(),
        deletedBy: userId || "system",
        status: "CLOSED",
      },
    });

    try {
      gateway.emitToCompany(companyId, "ticket.deleted", { ticketId });
      if (ticket.assignedToId) {
        gateway
          .getIO()
          .to(`agent:${ticket.assignedToId}`)
          .emit("ticket.deleted", { ticketId });
      }
    } catch (e) {
      Logger.error("[TicketService] Socket emit failed:", e);
    }
  }
}

export const ticketService = new TicketService();
