import { Prisma } from "@prisma/client";
import { auditLogRepository } from "@/repositories/AuditLogRepository";
import { Logger } from "@/utils/logger";

export interface IAuditLogData {
  companyId: string;
  userId?: string;
  action:
    | "CREATE"
    | "UPDATE"
    | "DELETE"
    | "LOGIN"
    | "EXPORT"
    | "READ_SENSITIVE"
    | string;
  entity: string;
  entityId: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * 🕵️ AUDIT SERVICE
 *
 * Provides "Fire-and-Forget" logging for critical system actions.
 * Ensures immutability and compliance tracing without blocking the main thread.
 */
export const auditService = {
  /**
   * Log an action to the database asynchronously.
   * Does NOT throw errors - silently logs failures to console to avoid disrupting user flow.
   */
  logAction: async (data: IAuditLogData) => {
    // Fire and forget - don't await to block response
    setImmediate(async () => {
      try {
        const sanitizedDetails = sanitizeDetails(data.details);

        await auditLogRepository.create({
          data: {
            companyId: data.companyId,
            userId: data.userId,
            action: data.action,
            entity: data.entity,
            entityId: data.entityId,
            details: sanitizedDetails as unknown as Prisma.InputJsonObject, // Clean sensitive data
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
          },
        });

        // Low-level debug log
        // Logger.debug(`[Audit] Logged ${data.action} on ${data.entity}`);
      } catch (error) {
        // Failing to log should NEVER crash the app, but should be reported
        Logger.error("[Audit] FAILED TO LOG ACTION:", error);
        if (data && data.details) {
          Logger.debug("Audit Data (Partial):", {
            action: data.action,
            entity: data.entity,
          });
        }
      }
    });
  },
};

/**
 * Removes sensitive fields (passwords, tokens) from JSON payloads
 * before saving them to the database loop.
 */
function sanitizeDetails(
  details?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!details) return undefined;

  const sensitiveKeys = [
    "password",
    "token",
    "secret",
    "apiKey",
    "creditCard",
    "stripeId",
    "authorization",
  ];

  const sanitized: Record<string, unknown> = { ...details };

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof sanitized[key] === "object" && sanitized[key] !== null) {
      // Recursive sanitization for nested objects
      sanitized[key] = sanitizeDetails(
        sanitized[key] as Record<string, unknown>,
      );
    }
  }

  return sanitized;
}
