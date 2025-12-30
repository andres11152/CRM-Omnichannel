import { Request, Response, NextFunction } from "express";
import { Logger } from "@/utils/logger";

/**
 * 🛡️ REQUEST TIMEOUT MIDDLEWARE
 *
 * Prevents long-running requests from hogging resources.
 * Critical for preventing server lockup under load.
 *
 * Default: 30 seconds (configurable per route)
 */

interface TimeoutOptions {
  timeout?: number; // milliseconds
  onTimeout?: (req: Request) => void;
}

export function requestTimeout(options: TimeoutOptions = {}) {
  const timeout = options.timeout || 30000; // 30 seconds default

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip timeout for streaming endpoints
    if (req.path.includes("/stream") || req.path.includes("/sse")) {
      return next();
    }

    const timer = setTimeout(() => {
      if (!res.headersSent) {
        Logger.error(
          `[Timeout] Request exceeded ${timeout}ms: ${req.method} ${req.path}`,
          {
            ip: req.ip,
            userId: (req as any).user?.id,
          }
        );

        if (options.onTimeout) {
          options.onTimeout(req);
        }

        res.status(408).json({
          status: "error",
          message: "Request timeout. Operation took too long.",
          code: "TIMEOUT",
        });
      }
    }, timeout);

    // Clear timeout when response is sent
    res.on("finish", () => clearTimeout(timer));
    res.on("close", () => clearTimeout(timer));

    next();
  };
}

/**
 * 🛡️ SLOW REQUEST LOGGER
 *
 * Logs requests that take longer than threshold.
 * Helps identify performance bottlenecks.
 */
export function slowRequestLogger(thresholdMs: number = 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (duration > thresholdMs) {
        Logger.warn(
          `[SlowRequest] ${req.method} ${req.path} took ${duration}ms`,
          {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
            query: req.query,
          }
        );
      }
    });

    next();
  };
}
