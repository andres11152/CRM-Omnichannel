import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class AiConfigRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findUnique(args: Prisma.AIConfigFindUniqueArgs) {
    return this.db.aIConfig.findUnique(args);
  }

  async upsert(args: Prisma.AIConfigUpsertArgs) {
    return this.db.aIConfig.upsert(args);
  }
}

export const aiConfigRepository = new AiConfigRepository();
