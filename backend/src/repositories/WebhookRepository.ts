import { prisma } from "@/config/database";

export const webhookRepository = {
  findManyByCompanyId(companyId: string) {
    return prisma.webhook.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Find all active webhooks for a company that are subscribed to a specific event.
   * This is the critical path for the WebhookDispatcher.
   */
  findActiveByEvent(companyId: string, eventType: string) {
    return prisma.webhook.findMany({
      where: {
        companyId,
        isActive: true,
        events: { has: eventType },
      },
    });
  },

  create(
    companyId: string,
    url: string,
    events: string[],
    secretKey: string | null,
  ) {
    return prisma.webhook.create({
      data: {
        companyId,
        url,
        events,
        secretKey,
        isActive: true,
      },
    });
  },

  deleteMany(id: string, companyId: string) {
    return prisma.webhook.deleteMany({
      where: { id, companyId },
    });
  },

  findFirstActive(id: string, companyId: string) {
    return prisma.webhook.findFirst({
      where: { id, companyId },
    });
  },

  updateActiveStatus(id: string, isActive: boolean) {
    return prisma.webhook.update({
      where: { id },
      data: { isActive },
    });
  },

  findDeliveryLogById(companyId: string, logId: string) {
    return prisma.webhookDeliveryLog.findFirst({
      where: { id: logId, companyId },
      include: { webhook: true },
    });
  },

  // ===== DELIVERY LOGS =====

  createDeliveryLog(data: {
    companyId: string;
    webhookId: string;
    eventType: string;
    url: string;
    status: number;
    duration: number;
    error?: string;
    payload?: Record<string, unknown>;
    attempt?: number;
  }) {
    return prisma.webhookDeliveryLog.create({
      data: {
        companyId: data.companyId,
        webhookId: data.webhookId,
        eventType: data.eventType,
        url: data.url,
        status: data.status,
        duration: data.duration,
        error: data.error || null,
        payload: data.payload || undefined,
        attempt: data.attempt || 1,
      },
    });
  },

  findDeliveryLogs(companyId: string, limit = 20) {
    return prisma.webhookDeliveryLog.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        eventType: true,
        url: true,
        status: true,
        duration: true,
        error: true,
        attempt: true,
        createdAt: true,
      },
    });
  },
};

