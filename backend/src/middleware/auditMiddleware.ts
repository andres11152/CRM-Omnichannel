import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { AuditService } from "@/services/AuditService";

/**
 * ️ AUDIT MIDDLEWARE
 *
 * Automatically captures changes based on HTTP methods and logs them.
 *
 * @param entity The resource name (e.g., 'Contact', 'Campaign')
 * @param getEntityId Function to extract ID from request (default: req.params.id)
 */
export const auditLog = (
  entity: string,
  getEntityId: (req: AuthenticatedRequest) => string = (req) => req.params.id,
) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Only audit mutating methods (POST, PATCH, PUT, DELETE)
    if (
      req.method === "GET" ||
      req.method === "OPTIONS" ||
      req.method === "HEAD"
    ) {
      return next();
    }

    const originalSend = res.json;
    const companyId = req.companyId || req.user?.companyId;
    const userId = req.user?.id;

    res.json = function (body) {
      res.json = originalSend;

      if (res.statusCode >= 200 && res.statusCode < 300) {
        let action: "CREATE" | "UPDATE" | "DELETE" | "SYSTEM_ACTION" | "INTEGRATION_SYNC" = "SYSTEM_ACTION";
        if (req.method === "POST") action = "CREATE";
        if (req.method === "PATCH" || req.method === "PUT") action = "UPDATE";
        if (req.method === "DELETE") action = "DELETE";

        let entityId = getEntityId(req);
        if (!entityId && req.method === "POST" && body?.data?.id) {
          entityId = body.data.id;
        }

        if (companyId) {
          void AuditService.log({
            companyId,
            userId,
            action,
            entity,
            entityId: entityId || "unknown",
            details: {
              method: req.method,
              url: req.originalUrl,
              body: req.method !== "DELETE" ? req.body : undefined,
            },
            ipAddress: req.ip,
            userAgent: req.get("User-Agent"),
          });
        }
      }

      return originalSend.call(this, body);
    };

    next();
  };
};
