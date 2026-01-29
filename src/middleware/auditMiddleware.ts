import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { auditService } from "@/services/auditService";

/**
 * 🕵️ AUDIT MIDDLEWARE
 *
 * Automatically captures changes based on HTTP methods and logs them.
 *
 * @param entity The resource name (e.g., 'Contact', 'Campaign')
 * @param getEntityId Function to extract ID from request (default: req.params.id)
 */
export const auditLog = (
  entity: string,
  getEntityId: (req: any) => string = (req) => req.params.id
) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Only audit mutating methods (POST, PATCH, PUT, DELETE)
    // GET requests are typically too high volume for database logging, use access logs for those.
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

    // Intercept response to get the final status and ensure success
    res.json = function (body) {
      // Restore original method
      res.json = originalSend;

      // Only log successful operations (2xx)
      // Failed attempts are logged by Error Middleware usually
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Determine action based on Method
        let action = "UNKNOWN";
        if (req.method === "POST") action = "CREATE";
        if (req.method === "PATCH" || req.method === "PUT") action = "UPDATE";
        if (req.method === "DELETE") action = "DELETE";

        // Try to determine Entity ID
        // For POST, it might be in the response (res.data.id)
        // For PATCH/DELETE, it's usually in params
        let entityId = getEntityId(req);

        if (!entityId && req.method === "POST" && body?.data?.id) {
          entityId = body.data.id;
        } else if (
          !entityId &&
          req.method === "POST" &&
          body?.data?.[entity.toLowerCase()]?.id
        ) {
          // e.g. data: { contact: { id: ... } }
          entityId = body.data[entity.toLowerCase()].id;
        }

        if (companyId) {
          auditService.logAction({
            companyId,
            userId,
            action,
            entity,
            entityId: entityId || "unknown",
            details: {
              method: req.method,
              url: req.originalUrl,
              body: req.method !== "DELETE" ? req.body : undefined, // Log what was sent
              // diff: ... (requires fetching value before update, expensive for middleware)
            },
            ipAddress: req.ip,
            userAgent: req.get("User-Agent"),
          });
        }
      }

      // Execute original response
      return originalSend.call(this, body);
    };

    next();
  };
};
