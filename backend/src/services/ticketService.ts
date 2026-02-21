import {
  Prisma,
  TicketStatus,
  TicketPriority,
  TicketResolutionType,
} from "@prisma/client";
import { ticketRepository } from "@/repositories/TicketRepository";
import { contactRepository } from "@/repositories/ContactRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { WhatsAppSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { userRepository } from "@/repositories/UserRepository";
import { notificationRepository } from "@/repositories/NotificationRepository";
import { gateway } from "@/gateways/socketGateway";
import { webhookDispatcher } from "@/services/webhookDispatcher";
import { cacheService } from "@/services/cacheService";

const whatsappSessionRepository = new WhatsAppSessionRepository();
import {
  toTicketDTO,
  TicketDTO,
  TicketWithRelations,
} from "@/types/ticket.types";
import { AppError } from "@/utils/AppError";

class TicketService {
  /**
   * Helper to enrich TicketDTOs with CRM Contact Data AND WhatsApp Session Index
   * Maps each ticket to its corresponding WhatsApp session based on phone number.
   */
  async enrichWithCrmData(
    dtos: TicketDTO[],
    companyId: string,
  ): Promise<TicketDTO[]> {
    const phonesToFetch = new Set<string>();
    dtos.forEach((t) => {
      if (t.contact.phone) phonesToFetch.add(t.contact.phone);
    });

    let whatsappSessions: {
      id: string;
      phone: string | null;
      sessionId: string;
      defaultQueueId: string | null;
    }[] = [];
    try {
      whatsappSessions = await cacheService.wrap(
        `company:${companyId}:sessions:connected:v1`,
        () =>
          whatsappSessionRepository.findMany({
            where: { companyId, status: "CONNECTED" },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              phone: true,
              sessionId: true,
              defaultQueueId: true,
            },
          }) as Promise<
            {
              id: string;
              phone: string | null;
              sessionId: string;
              defaultQueueId: string | null;
            }[]
          >,
        5,
      );
    } catch (cacheError) {
      console.warn(
        "[TicketService] Cache failed, fetching directly:",
        cacheError,
      );
      whatsappSessions = (await whatsappSessionRepository.findMany({
        where: { companyId, status: "CONNECTED" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          phone: true,
          sessionId: true,
          defaultQueueId: true,
        },
      })) as unknown as {
        id: string;
        phone: string | null;
        sessionId: string;
        defaultQueueId: string | null;
      }[];
    }

    const sessionIndexMap = new Map<string, number>();
    const queueToSessionDataMap = new Map<
      string,
      { index: number; phone: string | null }
    >();

    whatsappSessions.forEach((session, index) => {
      const sessionIdx = index + 1;
      if (session.phone) {
        const normalizedPhone = session.phone.replace(/^\+/, "");
        sessionIndexMap.set(normalizedPhone, sessionIdx);
      }
      if (session.defaultQueueId) {
        queueToSessionDataMap.set(session.defaultQueueId, {
          index: sessionIdx,
          phone: session.phone,
        });
      }
    });

    if (phonesToFetch.size === 0 && whatsappSessions.length === 0) return dtos;

    const contacts = await contactRepository.findMany({
      where: {
        companyId,
        phone: { in: Array.from(phonesToFetch) },
      },
      select: {
        id: true,
        phone: true,
        name: true,
        avatarUrl: true,
        tags: true,
      },
    });

    const crmMap = new Map<
      string,
      {
        id: string;
        phone: string | null;
        name: string | null;
        avatarUrl: string | null;
        tags: string[];
      }
    >();
    contacts.forEach((c) => {
      if (c.phone)
        crmMap.set(
          c.phone,
          c as {
            id: string;
            phone: string | null;
            name: string | null;
            avatarUrl: string | null;
            tags: string[];
          },
        );
    });

    return dtos.map((dto) => {
      const crmData = dto.contact.phone
        ? crmMap.get(dto.contact.phone)
        : undefined;
      let whatsappSessionIndex: number | undefined;
      let whatsappSessionPhone: string | undefined;

      if (dto.queueId && queueToSessionDataMap.has(dto.queueId)) {
        const data = queueToSessionDataMap.get(dto.queueId);
        whatsappSessionIndex = data?.index;
        whatsappSessionPhone = data?.phone || undefined;
      }

      if (!whatsappSessionIndex && whatsappSessions.length > 0) {
        if (whatsappSessions.length === 1) {
          whatsappSessionIndex = 1;
          whatsappSessionPhone = whatsappSessions[0].phone || undefined;
        }
      }

      if (crmData) {
        return {
          ...dto,
          tags:
            crmData.tags && crmData.tags.length > 0 ? crmData.tags : dto.tags,
          contact: {
            ...dto.contact,
            realContactId: crmData.id,
            name:
              crmData.name && crmData.name !== dto.contact.phone
                ? crmData.name
                : dto.contact.name,
            avatarUrl: crmData.avatarUrl || dto.contact.avatarUrl,
            whatsappSessionIndex,
            whatsappSessionPhone,
          },
        };
      }

      return {
        ...dto,
        contact: {
          ...dto.contact,
          whatsappSessionIndex,
          whatsappSessionPhone,
        },
      };
    });
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

    const nextTicketNumber = (lastTicket?.ticketNumber || 0) + 1;

    const newTicket = await ticketRepository.create({
      data: {
        subject: data.subject,
        description: data.description,
        ticketNumber: nextTicketNumber,
        priority: data.priority || "MEDIUM",
        status: data.status || "OPEN",
        companyId: data.companyId,
        createdById: data.userId,
        queueId: data.queueId || null,
        assignedToId: data.assignedToId || null,
      },
      include: {
        createdBy: true,
        assignedTo: true,
        queue: true,
        conversation: { include: { participants: true } },
      },
    });

    if (newTicket.queueId && !newTicket.assignedToId) {
      try {
        const { assignTicketToAgent } =
          await import("@/services/autoAssignmentService");
        await assignTicketToAgent(newTicket.id, newTicket.queueId);
      } catch (error) {
        console.error("[TicketService] Auto-assignment failed:", error);
      }
    }

    const ticketDTO = toTicketDTO(newTicket as unknown as TicketWithRelations);

    webhookDispatcher
      .dispatch(data.companyId, "ticket.created", ticketDTO)
      .catch((err) =>
        console.error("[TicketService] Webhook trigger failed", err),
      );

    return ticketDTO;
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
      const agent = (await userRepository.findUnique({
        where: { id: data.userId },
        select: { queues: { select: { id: true } } },
      } as Prisma.UserFindUniqueArgs)) as unknown as {
        queues: { id: string }[];
      };
      const agentQueueIds = agent?.queues?.map((q) => q.id) || [];

      where.AND = [
        {
          OR: [
            { conversation: { is: null } },
            { conversation: { isGroup: false } },
          ],
        },
        {
          OR: [
            { assignedToId: data.userId },
            { assignedToId: null, queueId: { in: agentQueueIds } },
          ],
        },
      ];
    }

    const tickets = await ticketRepository.findMany({
      where,
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
      orderBy: { createdAt: "desc" },
    });

    const baseDtos = tickets.map((t) =>
      toTicketDTO(t as unknown as TicketWithRelations),
    );

    try {
      const enrichmentPromise = this.enrichWithCrmData(
        baseDtos,
        data.companyId,
      );
      const timeoutPromise = new Promise<TicketDTO[]>((_, reject) =>
        setTimeout(
          () => reject(new Error("Enrichment timed out (>2000ms)")),
          2000,
        ),
      );
      return await Promise.race([enrichmentPromise, timeoutPromise]);
    } catch (enrichError) {
      console.error(`[TicketService] ⚠️ Enrichment skipped:`, enrichError);
      return baseDtos;
    }
  }

  async getTicketById(
    ticketId: string,
    companyId: string,
    userId: string,
    userRole: string,
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

    if (!ticket || ticket.deletedAt) {
      throw new AppError("Ticket not found", 404);
    }
    if (ticket.companyId !== companyId) {
      throw new AppError("You do not have permission to view this ticket", 403);
    }

    if (userRole === "AGENT") {
      const isMine = ticket.assignedToId === userId;
      const isUnassigned = !ticket.assignedToId;
      if (!isMine && !isUnassigned) {
        throw new AppError(
          "Access restricted to assigned or queue tickets only",
          403,
        );
      }
    }

    const baseDto = toTicketDTO(ticket as unknown as TicketWithRelations);
    const [finalTicket] = await this.enrichWithCrmData([baseDto], companyId);
    return finalTicket;
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

    if (data.queueId && updatedTicket.queueId && !updatedTicket.assignedToId) {
      try {
        const { assignTicketToAgent } =
          await import("@/services/autoAssignmentService");
        await assignTicketToAgent(updatedTicket.id, updatedTicket.queueId);
      } catch (error) {
        console.error("[TicketService] Auto-assignment failed:", error);
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
        await conversationRepository
          .updateConversation(updatedTicket.conversationId, syncData)
          .catch((e) => console.error("[TicketService] sync error:", e));
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
          await contactRepository.update(conv.contactId, {
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
            await contactRepository.update(contact.id, {
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
        console.error(
          "[TicketService] Failed to auto-block SPAM contact:",
          error,
        );
      }
    }

    const ticketDto = toTicketDTO(
      updatedTicket as unknown as TicketWithRelations,
    );

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
          })
          .catch((e) =>
            console.error("[TicketService] Notification failed:", e),
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
      console.error("[TicketService] Socket emit failed:", e);
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
      console.error("[TicketService] Socket emit failed:", e);
    }
  }
}

export const ticketService = new TicketService();
