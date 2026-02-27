import { prisma } from "@/config/database";

export const webhookRepository = {
  findManyByCompanyId(companyId: string) {
    return prisma.webhook.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
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
};
