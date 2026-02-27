import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class CampaignRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findFirst(args: Prisma.CampaignFindFirstArgs) {
    return this.db.campaign.findFirst(args);
  }

  async findMany(args: Prisma.CampaignFindManyArgs) {
    return this.db.campaign.findMany(args);
  }

  async create(args: Prisma.CampaignCreateArgs) {
    return this.db.campaign.create(args);
  }

  async update(args: Prisma.CampaignUpdateArgs) {
    return this.db.campaign.update(args);
  }

  async delete(id: string) {
    return this.db.campaign.delete({ where: { id } });
  }

  async count(args: Prisma.CampaignCountArgs) {
    return this.db.campaign.count(args);
  }
}

export const campaignRepository = new CampaignRepository();
