import { Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/prisma";
import { AuthenticatedRequest } from "@/types/types";

// --- HELPERS ---

// Map Prisma Ticket to Frontend Ticket (with Contact)
const mapTicketToFrontend = (ticket: any) => {
  return {
    ...ticket,
    contact: ticket.createdBy
      ? {
          id: ticket.createdBy.id,
          name: ticket.createdBy.name,
          email: ticket.createdBy.email,
          companyId: ticket.companyId,
          // Default/Mock fields for Contact interface compliance
          avatarUrl: `https://ui-avatars.com/api/?name=${ticket.createdBy.name}`,
          lastMessage: "",
          lastMessageTime: new Date(),
          unreadCount: 0,
          tags: ticket.conversation?.tags || [],
          channel: "WhatsApp", // Default
          assignedMode: "human",
          status: ticket.status,
        }
      : null,
    conversationId: ticket.conversationId,
  };
};

/**
 * CREATE TICKET
 */
export const createTicket = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { subject, description, priority, queueId, assignedToId, status } =
      req.body;
    const companyId = req.companyId || req.user?.companyId;
    const userId = req.user?.id;

    if (!companyId || !userId) {
      return next(new AppError("Company ID or User ID missing", 400));
    }

    const newTicket = await prisma.ticket.create({
      data: {
        subject,
        description,
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
        const { assignTicketToAgent } = await import(
          "@/services/autoAssignmentService"
        );
        await assignTicketToAgent(newTicket.id, newTicket.queueId);
        // We might want to re-fetch the ticket to return the assigned agent
        // But for now, returning the initial state is fine, frontend will see update via socket or refresh.
      } catch (error) {
        console.error("Auto-assignment failed:", error);
      }
    }

    res.status(201).json({
      status: "success",
      data: { ticket: mapTicketToFrontend(newTicket) },
    });
  }
);

/**
 * GET ALL TICKETS
 */
export const getAllTickets = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;
    const { status, priority, queueId, assignedToId } = req.query;

    if (!companyId) {
      // If MASTER, might want to see all? Or require companyId param?
      // For now, return empty if no company context
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
        conversation: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const mappedTickets = tickets.map(mapTicketToFrontend);

    res.status(200).json({
      status: "success",
      results: tickets.length,
      data: { tickets: mappedTickets },
    });
  }
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
        conversation: true,
      },
    });

    if (!ticket) {
      return next(new AppError("Ticket not found", 404));
    }

    // Security check: Ensure ticket belongs to user's company
    if (companyId && ticket.companyId !== companyId) {
      return next(
        new AppError("You do not have permission to view this ticket", 403)
      );
    }

    res.status(200).json({
      status: "success",
      data: { ticket: mapTicketToFrontend(ticket) },
    });
  }
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
      JSON.stringify(updateData)
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
          conversation: true,
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
        const { assignTicketToAgent } = await import(
          "@/services/autoAssignmentService"
        );
        await assignTicketToAgent(updatedTicket.id, updatedTicket.queueId);
      } catch (error) {
        console.error("Auto-assignment failed:", error);
      }
    }

    res.status(200).json({
      status: "success",
      data: { ticket: mapTicketToFrontend(updatedTicket) },
    });
  }
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

    res.status(204).send();
  }
);
