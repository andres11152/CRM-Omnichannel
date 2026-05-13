import { auditRepository, AuditFilter } from "@/repositories/AuditRepository";
import { userRepository } from "@/repositories/UserRepository";
import { companyRepository } from "@/repositories/CompanyRepository";
import { Logger } from "@/utils/logger";
import { Prisma } from "@prisma/client";

export class AuditService {
  /**
   * Retrieves audit logs enriched with User and Company names for the Master Dashboard
   */
  async getGlobalForensics(filter: AuditFilter) {
    Logger.info(`[AuditService] Fetching global forensics with filters: ${JSON.stringify(filter)}`);
    
    const { logs, total } = await auditRepository.findGlobalLogs(filter);

    // Enrich logs with names (In a high-load system, we'd use a cache or a complex JOIN)
    // For the Master Dashboard, we can do a batch fetch of unique IDs.
    const userIds = Array.from(new Set(logs.map(l => l.userId).filter(Boolean))) as string[];
    const companyIds = Array.from(new Set(logs.map(l => l.companyId)));

    const [users, companies] = await Promise.all([
      userRepository.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true }
      }, "__SYSTEM__"),
      companyRepository.findMany({
        where: { id: { in: companyIds } },
        select: { id: true, name: true }
      })
    ]);

    const userMap = new Map(users.map(u => [u.id, u]));
    const companyMap = new Map(companies.map(c => [c.id, c]));

    const enrichedLogs = logs.map(log => ({
      ...log,
      userName: log.userId ? userMap.get(log.userId)?.name || userMap.get(log.userId)?.email || "Sistema" : "Sistema",
      companyName: companyMap.get(log.companyId)?.name || "Desconocido",
    }));

    return {
      logs: enrichedLogs,
      total,
      limit: filter.limit || 50,
      offset: filter.offset || 0
    };
  }

  /**
   * Standard helper to log actions from any service
   */
  async logAction(context: {
    companyId: string;
    userId?: string;
    action: string;
    entity: string;
    entityId: string;
    details?: Prisma.InputJsonValue;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return await auditRepository.createLog(context);
  }

  /**
   * Specialized helper for WhatsApp Lifecycle events
   */
  async logWhatsAppEvent(companyId: string, sessionId: string, status: string, meta?: Prisma.InputJsonValue) {
    return await this.logAction({
      companyId,
      action: status,
      entity: "WhatsAppSession",
      entityId: sessionId,
      details: meta
    });
  }
}

export const auditService = new AuditService();
