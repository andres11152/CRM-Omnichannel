import { Notification, Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class NotificationRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async create(
    data: Prisma.NotificationUncheckedCreateInput,
  ): Promise<Notification> {
    return this.db.notification.create({ data });
  }
}

export const notificationRepository = new NotificationRepository();
