import { Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { ticketService } from "@/services/ticketService";
import { TicketPriority, TicketStatus } from "@prisma/client";

// --- CONTROLLER ACTIONS ---

export const createTicket = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 1. Data is validated by Zod Middleware at Route level
    const data = req.body;

    const companyId = req.companyId || req.user?.companyId;
    const userId = req.user?.id;

    if (!companyId || !userId) {
      return next(new AppError("Company ID or User ID missing", 400));
    }

    // 2. Delegate to Service
    const ticketDTO = await ticketService.createTicket({
      companyId,
      userId,
      subject: data.subject,
      description: data.description,
      priority: data.priority,
      status: data.status,
      queueId: data.queueId || undefined,
      assignedToId: data.assignedToId || undefined,
    });

    res.status(201).json({
      status: "success",
      data: { ticket: ticketDTO },
    });
  },
);

export const getAllTickets = catchAsync(
  async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return res
        .status(200)
        .json({ status: "success", results: 0, data: { tickets: [] } });
    }

    // 1. Query Params validated by Zod Middleware
    const query = req.query;

    const userId = req.user?.id;
    const userRole = req.user?.role || "USER";

    if (!userId) {
      return res
        .status(401)
        .json({ status: "error", message: "Unauthorized: User ID missing" });
    }

    // 2. Delegate to Service
    const finalTickets = await ticketService.getAllTickets({
      companyId,
      userId,
      userRole,
      status: query.status as TicketStatus | undefined,
      priority: query.priority as TicketPriority | undefined,
      queueId: query.queueId as string | undefined,
      assignedToId: query.assignedToId as string | undefined,
    });

    res.status(200).json({
      status: "success",
      results: finalTickets.length,
      data: { tickets: finalTickets },
    });
  },
);

export const getTicketById = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // ID Validated by ValidateSchema Middleware
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;
    const userId = req.user?.id;
    const userRole = req.user?.role || "USER";

    if (!companyId || !userId) {
      return next(new AppError("Company ID or userId missing", 400));
    }

    // 2. Delegate to Service
    try {
      const finalTicket = await ticketService.getTicketById(
        id,
        companyId,
        userId,
        userRole,
      );
      res.status(200).json({
        status: "success",
        data: { ticket: finalTicket },
      });
    } catch (error: unknown) {
      const err = error as AppError;
      return next(new AppError(err.message, err.statusCode || 500));
    }
  },
);

export const updateTicket = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Both Params and Body validated at route layer
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;
    const updaterId = req.user?.id;
    const updaterName = req.user?.name || "Sistema";

    if (!companyId || !updaterId) {
      return next(new AppError("Company ID or updater ID missing", 400));
    }

    // 2. Delegate to Service
    try {
      const updatedTicketDTO = await ticketService.updateTicket(
        id,
        companyId,
        updaterId,
        updaterName,
        req.body,
      );

      res.status(200).json({
        status: "success",
        data: { ticket: updatedTicketDTO },
      });
    } catch (error: unknown) {
      const err = error as AppError;
      return next(new AppError(err.message, err.statusCode || 500));
    }
  },
);

export const deleteTicket = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // ID validated by route middleware
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;
    const userId = req.user?.id;

    if (!companyId || !userId) {
      return next(new AppError("Company ID or user ID missing", 400));
    }

    // 1. Delegate to Service
    try {
      await ticketService.deleteTicket(id, companyId, userId);
      res.status(204).send();
    } catch (error: unknown) {
      const err = error as AppError;
      return next(new AppError(err.message, err.statusCode || 500));
    }
  },
);
