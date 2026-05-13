import { notificationRepository } from "@/repositories/NotificationRepository";
import { AppError } from "@/utils/AppError";
import { Prisma } from "@prisma/client";

/**
 *  NOTIFICATION CRUD SERVICE
 * [SEC] All queries scoped by companyId to prevent cross-tenant data leaks
 */
export const notificationService = {
  async findAll(
    companyId: string,
    userId: string,
    filters: { limit?: number; unreadOnly?: boolean },
  ) {
    const where: Prisma.NotificationWhereInput = { companyId, userId };
    if (filters.unreadOnly) where.read = false;

    const [notifications, unreadCount] = await Promise.all([
      notificationRepository.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: filters.limit || 20,
      }),
      notificationRepository.count({
        where: { companyId, userId, read: false },
      }),
    ]);

    return { notifications, unreadCount };
  },

  async markAsRead(companyId: string, id: string, userId: string) {
    const notification = await notificationRepository.findFirst({
      where: { id, userId, companyId },
    });
    if (!notification) throw new AppError("Notification not found", 404);
    await notificationRepository.update({
      where: { id },
      data: { read: true },
    });
  },

  async markAllAsRead(companyId: string, userId: string) {
    await notificationRepository.updateMany({
      where: { companyId, userId, read: false },
      data: { read: true },
    });
  },

  async delete(companyId: string, id: string, userId: string) {
    const notification = await notificationRepository.findFirst({
      where: { id, userId, companyId },
    });
    if (!notification) throw new AppError("Notification not found", 404);
    await notificationRepository.delete({ where: { id } });
  },
};
