import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class ApiKeyRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findMany(args: Prisma.ApiKeyFindManyArgs) {
    return this.db.apiKey.findMany(args);
  }

  async create(args: Prisma.ApiKeyCreateArgs) {
    return this.db.apiKey.create(args);
  }

  async deleteMany(args: Prisma.ApiKeyDeleteManyArgs) {
    return this.db.apiKey.deleteMany(args);
  }
}

export const apiKeyRepository = new ApiKeyRepository();
