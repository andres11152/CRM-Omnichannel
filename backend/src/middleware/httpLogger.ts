import { Request, Response, NextFunction } from "express";
import { Logger } from "@/utils/logger";
import { addSpanAttributes, getCurrentTraceId } from "@/utils/tracing";

/**
 * [STAT] STRUCTURED HTTP LOGGING MIDDLEWARE
 * Logs all HTTP requests/responses with OpenTelemetry traces
 */

export const httpLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const traceId = getCurrentTraceId();

  // Log incoming request
  Logger.http("Incoming HTTP Request", {
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    ip: req.ip,
    user_agent: req.get("user-agent"),
    trace_id: traceId,
  });

  // Add trace attributes
  addSpanAttributes({
    "http.method": req.method,
    "http.url": req.url,
    "http.user_agent": req.get("user-agent") || "unknown",
    "user.id":
      (req as unknown as { user?: { id?: string } }).user?.id || "anonymous",
    "user.role":
      (req as unknown as { user?: { role?: string } }).user?.role ||
      "anonymous",
  });

  // Capture response
  const originalSend = res.send;
  res.send = function (data: unknown) {
    res.send = originalSend;

    const duration = Date.now() - start;
    const statusCode = res.statusCode;

    // Log response
    const logLevel =
      statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "http";
    const logMethod =
      logLevel === "error"
        ? Logger.error
        : logLevel === "warn"
          ? Logger.warn
          : Logger.http;

    logMethod(`HTTP Response [${statusCode}]`, {
      method: req.method,
      url: req.url,
      status_code: statusCode,
      duration_ms: duration,
      content_length: res.get("content-length"),
      trace_id: traceId,
    });

    // Add response attributes to span
    addSpanAttributes({
      "http.status_code": statusCode,
      "http.duration_ms": duration,
    });

    return res.send(data);
  };

  next();
};

/**
 * [ALERT] ERROR LOGGING MIDDLEWARE
 * Structured error logging with stack traces
 */
export const errorLogger = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const traceId = getCurrentTraceId();

  Logger.error("HTTP Error", err, {
    method: req.method,
    url: req.url,
    status_code: res.statusCode,
    user_id: (req as unknown as { user?: { id?: string } }).user?.id,
    trace_id: traceId,
    request_body: req.body,
  });

  next(err);
};
