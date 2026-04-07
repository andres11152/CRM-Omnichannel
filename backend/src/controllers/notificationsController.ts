import { Response } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { notificationService } from "@/services/NotificationService";

/**
 *  NOTIFICATIONS CONTROLLER
 * Manage user notifications (mentions, assignments, etc.)
 * [SEC] All operations scoped by companyId + userId for multi-tenant isolation
 */

// Get user notifications
export const getNotifications = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;
    const companyId = req.user?.companyId || req.companyId;

    if (!userId || !companyId) {
      throw new AppError("Authentication context missing", 401);
    }

    const { limit = "20", unreadOnly = "false" } = req.query;

    const data = await notificationService.findAll(companyId, userId, {
      limit: parseInt(limit as string, 10),
      unreadOnly: unreadOnly === "true",
    });

    res.json({ status: "success", data });
  },
);

// Mark notification as read
export const markAsRead = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;
    const companyId = req.user?.companyId || req.companyId;
    const { id } = req.params;

    if (!userId || !companyId) {
      throw new AppError("Authentication context missing", 401);
    }

    await notificationService.markAsRead(companyId, id, userId);

    res.json({ status: "success", message: "Notification marked as read" });
  },
);

// Mark all as read
export const markAllAsRead = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;
    const companyId = req.user?.companyId || req.companyId;

    if (!userId || !companyId) {
      throw new AppError("Authentication context missing", 401);
    }

    await notificationService.markAllAsRead(companyId, userId);

    res.json({
      status: "success",
      message: "All notifications marked as read",
    });
  },
);

// Delete notification
export const deleteNotification = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;
    const companyId = req.user?.companyId || req.companyId;
    const { id } = req.params;

    if (!userId || !companyId) {
      throw new AppError("Authentication context missing", 401);
    }

    await notificationService.delete(companyId, id, userId);

    res.json({ status: "success", message: "Notification deleted" });
  },
);
