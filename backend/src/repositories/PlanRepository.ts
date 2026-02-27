import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class PlanRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findMany(args?: Prisma.PlanFindManyArgs) {
    return this.db.plan.findMany(args);
  }

  async findUnique(args: Prisma.PlanFindUniqueArgs) {
    return this.db.plan.findUnique(args);
  }

  async upsert(args: Prisma.PlanUpsertArgs) {
    return this.db.plan.upsert(args);
  }

  async delete(args: Prisma.PlanDeleteArgs) {
    return this.db.plan.delete(args);
  }
}

export const planRepository = new PlanRepository();
