import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { PrismaClient } from "@prisma/client";
import { Logger } from "@/utils/logger";

const prisma = new PrismaClient();

/**
 * Middleware to log API accesses to the database.
 * This runs asynchronously after the response has been sent to avoid blocking.
 */
export const apiAccessLogger = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const startAt = process.hrtime();

  res.on("finish", () => {
    // Only log if authenticated via API key (has apiKeyId)
    if (!req.user?.apiKeyId || req.user.id !== "api-system") return;

    const diff = process.hrtime(startAt);
    const durationMs = Math.round(diff[0] * 1e3 + diff[1] * 1e-6);

    const logData = {
      companyId: req.user.companyId,
      apiKeyId: req.user.apiKeyId,
      endpoint: req.originalUrl || req.url,
      method: req.method,
      statusCode: res.statusCode,
      ipAddress: req.ip || "unknown",
      durationMs,
    };

    // Fire and forget
    prisma.apiAccessLog.create({ data: logData }).catch((err) => {
      Logger.error("[ApiAccessLogger] Failed to write access log", err);
    });
  });

  next();
};
