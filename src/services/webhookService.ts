
import { PrismaClient } from '@prisma/client';
import { Webhook } from '@/types';

const prisma = new PrismaClient();

export const webhookService = {
  async getCompanyWebhooks(companyId: string): Promise<Webhook[]> {
    const webhooks = await (prisma as any).webhook.findMany({
      where: {
        companyId,
        isActive: true,
      },
    });
    return webhooks.map((webhook: { events: string | string[]; }) => ({
      ...webhook,
      events: webhook.events as string[],
    }));
  },
};
