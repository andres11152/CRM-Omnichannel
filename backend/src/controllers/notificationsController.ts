import { Response } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { catchAsync } from "@/utils/catchAsync";
import { prisma } from "@/config/database";
import { Prisma } from "@prisma/client";

/**
 * 🔔 NOTIFICATIONS CONTROLLER
 * Manage user notifications (mentions, assignments, etc.)
 */

// Get user notifications
export const getNotifications = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "User ID not found",
      });
    }

    const { limit = "20", unreadOnly = "false" } = req.query;

    const where: Prisma.NotificationWhereInput = { userId };
    if (unreadOnly === "true") {
      where.read = false;
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: parseInt(limit as string, 10),
    });

    res.json({
      status: "success",
      data: {
        notifications,
        unreadCount: await prisma.notification.count({
          where: { userId, read: false },
        }),
      },
    });
  },
);

// Mark notification as read
export const markAsRead = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "User ID not found",
      });
    }

    const notification = await prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      return res.status(404).json({
        status: "error",
        message: "Notification not found",
      });
    }

    await prisma.notification.update({
      where: { id },
      data: { read: true },
    });

    res.json({
      status: "success",
      message: "Notification marked as read",
    });
  },
);

// Mark all as read
export const markAllAsRead = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "User ID not found",
      });
    }

    await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

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
      return res.status(401).json({
        status: "error",
        message: "User ID not found",
      });
    }

    const notification = await prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      return res.status(404).json({
        status: "error",
        message: "Notification not found",
      });
    }

    await prisma.notification.delete({
      where: { id },
    });

    res.json({
      status: "success",
      message: "Notification deleted",
    });
  },
);
