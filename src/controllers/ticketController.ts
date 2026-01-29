import { Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/database";
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
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;
    const { status, priority, queueId, assignedToId } = req.query;

    console.log("[Tickets] 🔍 GET Params:", {
      status,
      assignedToIdQuery: assignedToId,
      reqUserId: req.user?.id,
      companyId,
    });

    if (!companyId) {
      return res
        .status(200)
        .json({ status: "success", results: 0, data: { tickets: [] } });
    }

    const where: any = { companyId };

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (queueId) where.queueId = queueId;
    if (assignedToId) where.assignedToId = assignedToId;

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

    console.log(
      `[Tickets] 🔍 Found ${tickets.length} tickets for Company ${companyId}`,
    );

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
    const allowedFields = [
      "subject",
      "description",
      "priority",
      "status",
      "queueId",
      "assignedToId",
      "resolvedAt",
      "resolutionType",
      "resolutionNotes",
    ];
    const updateData: any = {};

    Object.keys(data).forEach((key) => {
      if (allowedFields.includes(key)) {
        updateData[key] = data[key];
      }
    });

    // Handle explicit null for assignedToId (unassign)
    if (updateData.assignedToId === null) {
      delete updateData.assignedToId;
      updateData.assignedTo = { disconnect: true };
    }

    console.log("[TicketController] Updating ticket ID:", id);
    console.log("[TicketController] Raw Data:", JSON.stringify(data));
    console.log(
      "[TicketController] Filtered Update Data:",
      JSON.stringify(updateData),
    );

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
    } catch (error: any) {
      console.error("[TicketController] Prisma Update Failed:", error);
      // Check for Foreign Key constraint violation (e.g. invalid queueId)
      if (error.code === "P2003") {
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

    // 🔥 CRITICAL: Si el ticket tiene conversación, sincronizar el queueId
    // Esto permite que el AI assistant responda cuando se transfiere un ticket
    if (updatedTicket.conversationId && updateData.queueId !== undefined) {
      try {
        await prisma.conversation.update({
          where: { id: updatedTicket.conversationId },
          data: { queueId: updateData.queueId },
        });
        console.log(
          `[TicketController] ✓ Synced conversation queueId: ${updateData.queueId}`,
        );
      } catch (error) {
        console.error(
          "[TicketController] Failed to sync conversation queueId:",
          error,
        );
      }
    }

    // 🚀 EMIT EVENT FOR FRONTEND UPDATE
    // This fixes the bug where the badge doesn't update immediately
    try {
      const io = gateway.getIO();
      const payload = {
        id: updatedTicket.conversationId, // Match frontend "conversation.updated" expectation
        ticketId: updatedTicket.id,
        contact: {
          queueName: updatedTicket.queue?.name,
          assignedAgentName: updatedTicket.assignedTo?.name,
          assignedAgentId: updatedTicket.assignedToId,
        },
      };

      if (updatedTicket.companyId) {
        io.to(`company:${updatedTicket.companyId}`).emit(
          "conversation.updated",
          payload,
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

    console.log(
      `[TicketController] 🚨 DELETE request received for ticket: ${id}`,
    );
    console.log(
      `[TicketController] 👤 Requested by User: ${req.user?.id} (${req.user?.name})`,
    );

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      return next(new AppError("Ticket not found", 404));
    }
    if (companyId && ticket.companyId !== companyId) {
      return next(new AppError("Permission denied", 403));
    }

    const deletedTicket = await prisma.ticket.delete({ where: { id } });

    // 🚀 EMIT EVENT
    try {
      gateway.emitToCompany(companyId, "ticket.deleted", { ticketId: id });
    } catch (e) {
      console.error("[TicketController] Socket emit failed:", e);
    }

    res.status(204).send();
  },
);
