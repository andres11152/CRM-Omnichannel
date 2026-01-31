import { Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/database";
import { TicketPriority, TicketStatus, Prisma } from "@prisma/client";
import { AuthenticatedRequest } from "@/types/types";
import { gateway } from "@/gateways/socketGateway";
import { webhookDispatcher } from "@/services/webhookDispatcher";
import {
  toTicketDTO,
  TicketWithRelations,
  TicketDTO,
} from "../dtos/ticket.dto";

// --- HELPERS ---
// (Legacy mapTicketToFrontend removed in favor of toTicketDTO)

/**
 * Helper to enrich TicketDTOs with CRM Contact Data
 * This keeps the controller clean and focuses on business integration logic
 */
const enrichWithCrmData = async (
  dtos: TicketDTO[],
  companyId: string,
): Promise<TicketDTO[]> => {
  const phonesToFetch = new Set<string>();
  dtos.forEach((t) => {
    if (t.contact.phone) phonesToFetch.add(t.contact.phone);
  });

  if (phonesToFetch.size === 0) return dtos;

  const contacts = await prisma.contact.findMany({
    where: {
      companyId,
      phone: { in: Array.from(phonesToFetch) },
    },
    select: { id: true, phone: true, name: true, avatarUrl: true },
  });

  const crmMap = new Map<string, (typeof contacts)[0]>();
  contacts.forEach((c) => {
    if (c.phone) crmMap.set(c.phone, c);
  });

  return dtos.map((dto) => {
    const crmData = dto.contact.phone
      ? crmMap.get(dto.contact.phone)
      : undefined;

    if (crmData) {
      // 🛡️ CRM Data takes precedence
      return {
        ...dto,
        contact: {
          ...dto.contact,
          realContactId: crmData.id,
          name:
            crmData.name && crmData.name !== dto.contact.phone
              ? crmData.name
              : dto.contact.name,
          avatarUrl: crmData.avatarUrl || dto.contact.avatarUrl,
        },
      };
    }
    return dto;
  });
};

export const createTicket = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { subject, description, priority, queueId, assignedToId, status } =
      req.body;
    const companyId = req.companyId || req.user?.companyId;
    const userId = req.user?.id;

    if (!companyId || !userId) {
      return next(new AppError("Company ID or User ID missing", 400));
    }

    // Get next ticket number for this company
    const lastTicket = await prisma.ticket.findFirst({
      where: { companyId },
      orderBy: { ticketNumber: "desc" },
      select: { ticketNumber: true },
    });

    const nextTicketNumber = (lastTicket?.ticketNumber || 0) + 1;

    const newTicket = await prisma.ticket.create({
      data: {
        subject,
        description,
        ticketNumber: nextTicketNumber,
        priority: priority || "MEDIUM",
        status: status || "OPEN",
        companyId,
        createdById: userId,
        queueId: queueId || null,
        assignedToId: assignedToId || null,
      },
      include: {
        createdBy: true,
        assignedTo: true,
        queue: true,
        conversation: true,
      },
    });

    // Auto-assignment trigger
    if (newTicket.queueId && !newTicket.assignedToId) {
      // We can run this in background or await it.
      // For responsiveness, let's await it but catch errors so we don't fail the request.
      try {
        const { assignTicketToAgent } =
          await import("@/services/autoAssignmentService");
        await assignTicketToAgent(newTicket.id, newTicket.queueId);
        // We might want to re-fetch the ticket to return the assigned agent
        // But for now, returning the initial state is fine, frontend will see update via socket or refresh.
      } catch (error) {
        console.error("Auto-assignment failed:", error);
      }
    }

    // 🕸️ WEBHOOK DISPATCH
    // We send payload as we return it
    const ticketDTO = toTicketDTO(newTicket as unknown as TicketWithRelations);

    webhookDispatcher
      .dispatch(companyId, "ticket.created", ticketDTO)
      .catch((err) => console.error("Webhook trigger failed", err));

    res.status(201).json({
      status: "success",
      data: { ticket: ticketDTO },
    });
  },
);

/**
 * GET ALL TICKETS
 */
export const getAllTickets = catchAsync(
  async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;
    const { status, priority, queueId, assignedToId } = req.query;

    if (!companyId) {
      return res
        .status(200)
        .json({ status: "success", results: 0, data: { tickets: [] } });
    }

    const where: Prisma.TicketWhereInput = { companyId };

    if (status) where.status = status as TicketStatus;
    if (priority) where.priority = priority as TicketPriority;
    if (queueId) where.queueId = queueId as string;
    if (assignedToId) where.assignedToId = assignedToId as string;

    // 🛡️ 100-YEAR FIX: Strict Access Control (The "User Request" barrier)
    // Agents can ONLY see tickets assigned to them.
    // They cannot see the global queue or other agents' tickets.
    if (req.user?.role === "AGENT") {
      where.assignedToId = req.user.id;
      console.info(
        `[TicketController] 🔍 AGENT Query: userId=${req.user.id}, companyId=${companyId}`,
      );
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        createdBy: true,
        assignedTo: true,
        queue: true,
        conversation: {
          include: {
            messages: {
              take: 1,
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 🔍 DEBUG: Log what we found for agents
    if (req.user?.role === "AGENT") {
      console.info(
        `[TicketController] 🎯 AGENT Results: Found ${tickets.length} tickets for ${req.user.id}`,
      );
      tickets.forEach((t) => {
        console.info(
          `  - Ticket ${t.id} | assignedToId: ${t.assignedToId} | status: ${t.status}`,
        );
      });
    }

    // 1. Initial Mapping to DTO
    const baseDtos = tickets.map((t) =>
      toTicketDTO(t as unknown as TicketWithRelations),
    );

    // 2. Enrich with CRM Data (Uses efficient batch fetching helper)
    const finalTickets = await enrichWithCrmData(baseDtos, companyId);

    res.status(200).json({
      status: "success",
      results: finalTickets.length,
      data: { tickets: finalTickets },
    });
  },
);

/**
 * GET TICKET BY ID
 */
export const getTicketById = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        createdBy: true,
        assignedTo: true,
        queue: true,
        conversation: {
          include: {
            messages: {
              take: 1,
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });

    if (!ticket) {
      return next(new AppError("Ticket not found", 404));
    }

    // Security check
    if (companyId && ticket.companyId !== companyId) {
      return next(
        new AppError("You do not have permission to view this ticket", 403),
      );
    }

    // 🛡️ 100-YEAR FIX: Agent Isolation
    if (req.user?.role === "AGENT" && ticket.assignedToId !== req.user.id) {
      return next(
        new AppError(
          "Access denied: You can only view tickets assigned to you.",
          403,
        ),
      );
    }

    // 1. Initial Mapping
    const baseDto = toTicketDTO(ticket as unknown as TicketWithRelations);

    // 2. Enrich with CRM Data
    // Note: If companyId is missing (unlikely due to auth middleware), enrichment is skipped safely
    const [finalTicket] = companyId
      ? await enrichWithCrmData([baseDto], companyId)
      : [baseDto];

    res.status(200).json({
      status: "success",
      data: { ticket: finalTicket },
    });
  },
);

/**
 * UPDATE TICKET
 */
export const updateTicket = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;
    const data = req.body;

    // First check existence and permission
    const existingTicket = await prisma.ticket.findUnique({ where: { id } });
    if (!existingTicket) {
      return next(new AppError("Ticket not found", 404));
    }
    if (companyId && existingTicket.companyId !== companyId) {
      return next(new AppError("Permission denied", 403));
    }

    // Handle status change logic (e.g. resolvedAt)
    if (data.status === "RESOLVED" || data.status === "CLOSED") {
      if (
        existingTicket.status !== "RESOLVED" &&
        existingTicket.status !== "CLOSED"
      ) {
        data.resolvedAt = new Date();
      }
    }

    // Filter allowed fields to prevent Prisma errors with unknown arguments
    // 🛡️ 100-YEAR FIX: Strict Typing for Updates
    // We strictly map only allowed fields to prevent arbitrary data injection
    const updateData: Prisma.TicketUpdateInput = {};

    if (data.subject !== undefined) updateData.subject = data.subject;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (
      data.priority !== undefined &&
      Object.values(TicketPriority).includes(data.priority)
    ) {
      updateData.priority = data.priority;
    }
    if (
      data.status !== undefined &&
      Object.values(TicketStatus).includes(data.status)
    ) {
      updateData.status = data.status;
    }
    if (data.queueId !== undefined) {
      updateData.queue = data.queueId
        ? { connect: { id: data.queueId } }
        : { disconnect: true };
    }
    if (data.assignedToId !== undefined) {
      updateData.assignedTo = data.assignedToId
        ? { connect: { id: data.assignedToId } }
        : { disconnect: true };
    }
    if (data.resolvedAt !== undefined) updateData.resolvedAt = data.resolvedAt;
    if (data.resolutionType !== undefined)
      updateData.resolutionType = data.resolutionType;
    if (data.resolutionNotes !== undefined)
      updateData.resolutionNotes = data.resolutionNotes;

    // (Handled above in strict mapping)
    // if (updateData.assignedToId === null) { ... } logic is now obsolete due to above block

    let updatedTicket;
    try {
      updatedTicket = await prisma.ticket.update({
        where: { id },
        data: updateData,
        include: {
          createdBy: true,
          assignedTo: true,
          queue: true,
          conversation: {
            include: {
              messages: {
                take: 1,
                orderBy: { createdAt: "desc" },
              },
            },
          },
        },
      });
    } catch (error: unknown) {
      console.error("[TicketController] Prisma Update Failed:", error);
      // Check for Foreign Key constraint violation (e.g. invalid queueId)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        return next(new AppError("Invalid Queue ID or User ID", 400));
      }
      throw error;
    }

    // Auto-assignment trigger if moved to a queue and unassigned
    if (data.queueId && updatedTicket.queueId && !updatedTicket.assignedToId) {
      try {
        const { assignTicketToAgent } =
          await import("@/services/autoAssignmentService");
        await assignTicketToAgent(updatedTicket.id, updatedTicket.queueId);
      } catch (error) {
        console.error("Auto-assignment failed:", error);
      }
    }

    // 🔥 CRITICAL: Sync Conversation Queue & Assignment
    // The Chat System relies on Conversation model, not Ticket model.
    // If we don't sync assignedToId, the agent won't receive message socket events.
    if (updatedTicket.conversationId) {
      const syncData: Prisma.ConversationUpdateInput = {};
      let needsSync = false;

      if (data.queueId !== undefined) {
        syncData.queue = data.queueId
          ? { connect: { id: data.queueId } }
          : { disconnect: true };
        needsSync = true;
      }

      if (data.assignedToId !== undefined) {
        syncData.assignedTo = data.assignedToId
          ? { connect: { id: data.assignedToId } }
          : { disconnect: true };
        needsSync = true;
      }

      if (needsSync) {
        try {
          await prisma.conversation.update({
            where: { id: updatedTicket.conversationId },
            data: syncData,
          });
          console.info(
            "[TicketController] ✅ Synced Conversation Assignment/Queue",
          );
        } catch (error) {
          console.error(
            "[TicketController] Failed to sync conversation:",
            error,
          );
        }
      }
    }

    // 🚀 ENTERPRISE: Real-time notifications for ticket updates
    const ticketDto = toTicketDTO(
      updatedTicket as unknown as TicketWithRelations,
    );

    try {
      const io = gateway.getIO();
      const previousAssignee = existingTicket.assignedToId;
      const newAssignee = updatedTicket.assignedToId;
      const assigneeChanged =
        previousAssignee !== newAssignee && newAssignee !== null;

      // 1️⃣ BROADCAST: Notify entire company about ticket update (for list refreshes)
      io.to(`company:${updatedTicket.companyId}`).emit("ticket.updated", {
        ticket: ticketDto,
        changedFields: Object.keys(updateData),
      });

      // 1.5 DIRECT UPDATE (100-Year Fix): Always notify the current assignee about ANY update
      // Agents are NOT in the company room, so they need direct updates.
      if (updatedTicket.assignedToId) {
        io.to(`agent:${updatedTicket.assignedToId}`).emit("ticket.updated", {
          ticket: ticketDto,
          changedFields: Object.keys(updateData),
        });
      }

      // 2️⃣ DIRECT NOTIFICATION: If ticket was assigned to someone new (Sound + Toast)
      if (assigneeChanged && newAssignee) {
        // Emit to agent's personal room (Canonical room is `agent:${id}`)
        io.to(`agent:${newAssignee}`).emit("ticket.assigned", {
          ticket: ticketDto,
          message: `Se te ha asignado el ticket #${updatedTicket.ticketNumber}: ${updatedTicket.subject}`,
          assignedBy: req.user?.name || "Sistema",
          timestamp: new Date().toISOString(),
        });

        // 3️⃣ PERSISTENT NOTIFICATION: Create in-app notification record
        try {
          await prisma.notification.create({
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
                assignedBy: req.user?.id,
              },
              read: false,
            },
          });
        } catch (notifError) {
          // Non-blocking: Log but don't fail the request
          console.error(
            "[TicketController] Failed to create notification:",
            notifError,
          );
        }
      }

      // 4️⃣ CONVERSATION SYNC: Also emit conversation.updated for chat panels
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
        // 3️⃣ PERSISTENT NOTIFICATION: Create in-app notification record
        try {
          await prisma.notification.create({
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
                assignedBy: req.user?.id,
              },
              read: false,
            },
          });
        } catch (notifError) {
          // Non-blocking: Log but don't fail the request
          console.error(
            "[TicketController] Failed to create notification:",
            notifError,
          );
        }
      }

      // 4️⃣ CONVERSATION SYNC: Also emit conversation.updated for chat panels
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
      console.error("[TicketController] Socket emit failed:", e);
    }

    res.status(200).json({
      status: "success",
      data: {
        ticket: toTicketDTO(updatedTicket as unknown as TicketWithRelations),
      },
    });
  },
);

/**
 * DELETE TICKET
 */
export const deleteTicket = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      return next(new AppError("Ticket not found", 404));
    }
    if (companyId && ticket.companyId !== companyId) {
      return next(new AppError("Permission denied", 403));
    }

    await prisma.ticket.delete({ where: { id } });

    // 🚀 EMIT EVENT
    try {
      if (companyId) {
        gateway.emitToCompany(companyId, "ticket.deleted", { ticketId: id });
      }
    } catch (e) {
      console.error("[TicketController] Socket emit failed:", e);
    }

    res.status(204).send();
  },
);
