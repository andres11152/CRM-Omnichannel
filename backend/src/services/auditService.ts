import { auditLogRepository } from "@/repositories/AuditLogRepository";
import { Logger } from "@/utils/logger";
import { Prisma } from "@prisma/client";

/**
 * [SEC] GLOBAL AUDIT SERVICE
 * 
 * Captures all critical administrative and system actions for compliance and security.
 * Every action is scoped by companyId to preserve multi-tenant integrity.
 * 
 * [ARCH] Uses AuditLogRepository — zero direct Prisma access.
 */
export class AuditService {
  /**
   * Logs an action to the AuditLog table
   */
  static async log(params: {
    companyId: string;
    userId?: string;
    action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "EXPORT" | "SYSTEM_ACTION" | "INTEGRATION_SYNC";
    entity: string;
    entityId: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await auditLogRepository.create({
        data: {
          companyId: params.companyId,
          userId: params.userId || null,
          action: params.action,
          entity: params.entity,
          entityId: params.entityId,
          details: params.details ? (params.details as Prisma.InputJsonValue) : undefined,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
        },
      });
      
      Logger.debug(`[AuditLog] ${params.action} on ${params.entity}:${params.entityId} (Company: ${params.companyId})`);
    } catch (error) {
      // [SEC] Fail-safe: A failure in logging should NEVER crash the main business logic
      Logger.error(`[AuditService] [ERROR] Failed to write audit log:`, error as Error);
    }
  }

  /**
   * Shortcut for logging WhatsApp connection events
   */
  static async logWhatsAppEvent(
    companyId: string, 
    sessionId: string, 
    event: "CONNECTED" | "DISCONNECTED" | "AUTH_FAILURE" | "VERSION_MISMATCH" | "SCANNING" | "SYNC_COMPLETED",
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      companyId,
      action: "SYSTEM_ACTION",
      entity: "WhatsAppSession",
      entityId: sessionId,
      details: { event, ...details },
    });
  }

  /**
   * Shortcut for security-sensitive actions
   */
  static async logSecurityAction(
    companyId: string,
    userId: string,
    action: "LOGIN" | "LOGOUT" | "EXPORT",
    details?: Record<string, unknown>,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      companyId,
      userId,
      action,
      entity: "User",
      entityId: userId,
      details,
      ipAddress,
    });
  }
}
