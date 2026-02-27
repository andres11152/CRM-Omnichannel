import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class PushSubscriptionRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findMany(args: Prisma.PushSubscriptionFindManyArgs) {
    return this.db.pushSubscription.findMany(args);
  }

  async findFirst(args: Prisma.PushSubscriptionFindFirstArgs) {
    return this.db.pushSubscription.findFirst(args);
  }

  async upsert(args: Prisma.PushSubscriptionUpsertArgs) {
    return this.db.pushSubscription.upsert(args);
  }

  async delete(args: Prisma.PushSubscriptionDeleteArgs) {
    return this.db.pushSubscription.delete(args);
  }
}

export const pushSubscriptionRepository = new PushSubscriptionRepository();
