import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class AuditLogRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findMany(args: Prisma.AuditLogFindManyArgs) {
    return this.db.auditLog.findMany(args);
  }

  async create(args: Prisma.AuditLogCreateArgs) {
    return this.db.auditLog.create(args);
  }
}

export const auditLogRepository = new AuditLogRepository();
