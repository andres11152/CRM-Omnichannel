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
          tags: [],
          channel: "WhatsApp", // Default
          assignedMode: "human",
          status: "OPEN",
        }
      : null,
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
      },
    });

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

    const updatedTicket = await prisma.ticket.update({
      where: { id },
      data: {
        ...data,
        // Prevent changing companyId or createdById usually
        companyId: undefined,
        createdById: undefined,
      },
      include: {
        createdBy: true,
        assignedTo: true,
        queue: true,
      },
    });

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
