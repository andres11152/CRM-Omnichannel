import { Response } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { catchAsync } from "@/utils/catchAsync";
import { notificationService } from "@/services/notificationService";

/**
 * 🔔 NOTIFICATIONS CONTROLLER
 * Manage user notifications (mentions, assignments, etc.)
 */

// Get user notifications
export const getNotifications = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res
        .status(401)
        .json({ status: "error", message: "User ID not found" });
    }

    const { limit = "20", unreadOnly = "false" } = req.query;

    const data = await notificationService.findAll(userId, {
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
    const { id } = req.params;

    if (!userId) {
      return res
        .status(401)
        .json({ status: "error", message: "User ID not found" });
    }

    await notificationService.markAsRead(id, userId);

    res.json({ status: "success", message: "Notification marked as read" });
  },
);

// Mark all as read
export const markAllAsRead = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res
        .status(401)
        .json({ status: "error", message: "User ID not found" });
    }

    await notificationService.markAllAsRead(userId);

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
    const { id } = req.params;

    if (!userId) {
      return res
        .status(401)
        .json({ status: "error", message: "User ID not found" });
    }

    await notificationService.delete(id, userId);

    res.json({ status: "success", message: "Notification deleted" });
  },
);
