import { auditLogRepository } from "@/repositories/AuditLogRepository";
import { Logger } from "@/utils/logger";

interface CreateAuditLogDTO {
  companyId: string;
  userId?: string | null;
  action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "EXPORT" | "SYSTEM_EVENT";
  entity: string;
  entityId: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * 🕵️‍♂️ AUDIT LOG SERVICE
 *
 * Centralized service to register all sensitive changes in the platform
 * ensuring compliance, traceability, and robust multi-tenancy.
 */
export const auditLogService = {
  /**
   * Log an action to the database and standard output.
   */
  async log(data: CreateAuditLogDTO) {
    try {
      // 1. Persist to Postgres for Analytics and Compliance
      const log = await auditLogRepository.create({
        data: {
          companyId: data.companyId,
          userId: data.userId || null,
          action: data.action,
          entity: data.entity,
          entityId: data.entityId,
          details: data.details ? JSON.stringify(data.details) : null,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
      });

      // 2. Add Winston logging for infrastructure level metrics
      Logger.info(
        `[AUDIT] [${data.companyId}] ${data.action} on ${data.entity} (${data.entityId}) by ${
          data.userId || "System"
        }`,
      );

      return log;
    } catch (error) {
      Logger.error(`[AUDIT] Failed to save audit log:`, error);
      // We don't throw an error here to prevent interrupting the main business flow
      // if logging fails. This guarantees system resilience.
      return null;
    }
  },

  /**
   * Fetch recent audit logs for a tenant.
   * Typically used by super-admins or company admins.
   */
  async getRecentLogs(companyId: string, limit = 50) {
    return await auditLogRepository.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },
};
