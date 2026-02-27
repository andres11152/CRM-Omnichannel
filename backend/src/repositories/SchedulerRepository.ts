import { prisma } from "@/config/database";

export const schedulerRepository = {
  findPendingScheduledMessages(limit: number = 50) {
    return prisma.message.findMany({
      where: {
        status: "SCHEDULED",
      },
      include: { conversation: true },
      take: limit,
    });
  },

  findUsersForConversation(conversationId: string, limit: number = 1) {
    return prisma.user.findMany({
      where: {
        conversations: { some: { id: conversationId } },
        role: "USER",
      },
      take: limit,
    });
  },

  deleteScheduledMessage(messageId: string) {
    return prisma.message.delete({
      where: { id: messageId },
    });
  },
};
