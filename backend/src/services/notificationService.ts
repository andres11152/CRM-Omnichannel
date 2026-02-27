import { notificationRepository } from "@/repositories/NotificationRepository";
import { AppError } from "@/utils/AppError";
import { Prisma } from "@prisma/client";

/**
 * 🔔 NOTIFICATION CRUD SERVICE
 */
export const notificationService = {
  async findAll(
    userId: string,
    filters: { limit?: number; unreadOnly?: boolean },
  ) {
    const where: Prisma.NotificationWhereInput = { userId };
    if (filters.unreadOnly) where.read = false;

    const [notifications, unreadCount] = await Promise.all([
      notificationRepository.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: filters.limit || 20,
      }),
      notificationRepository.count({ where: { userId, read: false } }),
    ]);

    return { notifications, unreadCount };
  },

  async markAsRead(id: string, userId: string) {
    const notification = await notificationRepository.findFirst({
      where: { id, userId },
    });
    if (!notification) throw new AppError("Notification not found", 404);
    await notificationRepository.update({
      where: { id },
      data: { read: true },
    });
  },

  async markAllAsRead(userId: string) {
    await notificationRepository.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  },

  async delete(id: string, userId: string) {
    const notification = await notificationRepository.findFirst({
      where: { id, userId },
    });
    if (!notification) throw new AppError("Notification not found", 404);
    await notificationRepository.delete({ where: { id } });
  },
};
