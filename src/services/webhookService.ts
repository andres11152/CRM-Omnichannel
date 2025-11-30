import { prisma } from "@/config/prisma";
import { Webhook } from "@/types";

export const webhookService = {
  async getCompanyWebhooks(companyId: string): Promise<Webhook[]> {
    const webhooks = await (prisma as any).webhook.findMany({
      where: {
        companyId,
        isActive: true,
      },
    });
    return webhooks.map((webhook: { events: string | string[] }) => ({
      ...webhook,
      events: webhook.events as string[],
    }));
  },

  async createWebhook(data: {
    companyId: string;
    url: string;
    events: string[];
  }): Promise<Webhook> {
    const webhook = await (prisma as any).webhook.create({
      data: {
        companyId: data.companyId,
        url: data.url,
        events: data.events,
        isActive: true,
        secretKey:
          Math.random().toString(36).substring(2, 15) +
          Math.random().toString(36).substring(2, 15),
      },
    });
    return {
      ...webhook,
      events: webhook.events as string[],
    };
  },
};
