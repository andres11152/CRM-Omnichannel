import { prisma } from "@/config/database";
import { Logger } from "@/utils/logger";
import { Prisma } from "@prisma/client";

export interface AuditFilter {
  companyId?: string;
  userId?: string;
  entity?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class AuditRepository {
  /**
   * Fetches global audit logs with filtering (Master Only perspective)
   */
  async findGlobalLogs(filter: AuditFilter) {
    try {
      const where: Prisma.AuditLogWhereInput = {};

      if (filter.companyId) where.companyId = filter.companyId;
      if (filter.userId) where.userId = filter.userId;
      if (filter.entity) where.entity = filter.entity;
      if (filter.action) where.action = filter.action;

      if (filter.startDate || filter.endDate) {
        where.createdAt = {};
        if (filter.startDate) where.createdAt.gte = filter.startDate;
        if (filter.endDate) where.createdAt.lte = filter.endDate;
      }

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: filter.limit || 50,
          skip: filter.offset || 0,
        }),
        prisma.auditLog.count({ where }),
      ]);

      return { logs, total };
    } catch (error) {
      Logger.error("[AuditRepository] Error fetching global logs", error);
      throw error;
    }
  }

  /**
   * Creates a new audit log entry
   */
  async createLog(data: {
    companyId: string;
    userId?: string;
    action: string;
    entity: string;
    entityId: string;
    details?: Prisma.InputJsonValue;
    ipAddress?: string;
    userAgent?: string;
  }) {
    try {
      return await prisma.auditLog.create({
        data: {
          ...data,
          details: data.details || {},
        },
      });
    } catch (error) {
      // Non-blocking error for audit logs (don't break the main transaction if log fails)
      Logger.error("[AuditRepository] Failed to create audit log", error);
    }
  }
}

export const auditRepository = new AuditRepository();
