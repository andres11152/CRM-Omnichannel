import { prisma } from "@/config/database";
import { Prisma } from "@prisma/client";

export const notificationRepository = {
  findMany(args: Prisma.NotificationFindManyArgs) {
    return prisma.notification.findMany(args);
  },

  count(args: Prisma.NotificationCountArgs) {
    return prisma.notification.count(args);
  },

  findFirst(args: Prisma.NotificationFindFirstArgs) {
    return prisma.notification.findFirst(args);
  },

  update(args: Prisma.NotificationUpdateArgs) {
    return prisma.notification.update(args);
  },

  updateMany(args: Prisma.NotificationUpdateManyArgs) {
    return prisma.notification.updateMany(args);
  },

  delete(args: Prisma.NotificationDeleteArgs) {
    return prisma.notification.delete(args);
  },

  create(args: Prisma.NotificationCreateArgs) {
    return prisma.notification.create(args);
  },

  getTicketWithAssigneeAndContact(ticketId: string) {
    return prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        assignedTo: { select: { name: true, email: true } },
        conversation: {
          select: { contact: { select: { name: true } } },
        },
      },
    });
  },

  getCampaignWithCreator(campaignId: string) {
    return prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        name: true,
        companyId: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  },
};
