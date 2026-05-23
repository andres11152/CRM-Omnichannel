import winston from "winston";
import { trace, SpanStatusCode, Attributes } from "@opentelemetry/api";

/**
 * [STAT] ENTERPRISE-GRADE STRUCTURED LOGGING
 * Winston with JSON format, OpenTelemetry integration, and sensitive data masking
 */

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "white",
};

winston.config.addColors(colors);

/**
 *  Sensitive Data Masking
 */
const sensitiveKeys = [
  /pass/i,
  /token/i,
  /secret/i,
  /key/i,
  /auth/i,
  /credit/i,
  /card/i,
  /cvv/i,
  /ssn/i,
];

const maskSensitiveData = (obj: unknown): unknown => {
  if (!obj || typeof obj !== "object" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(maskSensitiveData);

  const masked = { ...(obj as Record<string, unknown>) };
  for (const key in masked) {
    if (sensitiveKeys.some((regex) => regex.test(key))) {
      masked[key] = "***REDACTED***";
    } else if (typeof masked[key] === "object" && masked[key] !== null) {
      masked[key] = maskSensitiveData(masked[key]);
    }
  }
  return masked;
};

/**
 * [SEARCH] OpenTelemetry Context Enrichment
 * Automatically adds trace/span IDs to logs
 */
const addTraceContext = winston.format((info) => {
  const span = trace.getActiveSpan();
  if (span) {
    const spanContext = span.spanContext();
    info.trace_id = spanContext.traceId;
    info.span_id = spanContext.spanId;
    info.trace_flags = spanContext.traceFlags;
  }
  return info;
});

/**
 *  JSON Format for Production
 */
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
  winston.format.errors({ stack: true }),
  addTraceContext(),
  winston.format.json(),
  winston.format((info) => {
    // Add service metadata
    info.service = "sentry-crm-api";
    info.environment = process.env.NODE_ENV || "development";
    info.hostname = process.env.HOSTNAME || "localhost";
    info.pid = process.pid;

    // Mask sensitive data
    info = maskSensitiveData(info) as winston.Logform.TransformableInfo;
    return info;
  })(),
);

/**
 *  Pretty Format for Development
 */
const prettyFormat = winston.format.combine(
  winston.format.timestamp({ format: "HH:mm:ss.SSS" }),
  winston.format.errors({ stack: true }),
  addTraceContext(),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, trace_id, span_id, ...meta } = info;

    let msg = `${timestamp} ${level}: ${message}`;

    // Add trace info if available
    if (typeof trace_id === "string") {
      msg += ` [trace:${trace_id.substring(0, 8)}]`;
    }
    if (typeof span_id === "string") {
      msg += ` [span:${span_id.substring(0, 8)}]`;
    }

    // Add metadata if exists
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(maskSensitiveData(meta))}`;
    }

    return msg;
  }),
);

/**
 *  Transport Configuration
 */
const transports: winston.transport[] = [];

// Console (always enabled)
transports.push(
  new winston.transports.Console({
    format: process.env.NODE_ENV === "production" ? jsonFormat : prettyFormat,
  }),
);

// File transports (production only)
if (process.env.NODE_ENV === "production") {
  transports.push(
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      format: jsonFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true,
    }),
    new winston.transports.File({
      filename: "logs/combined.log",
      format: jsonFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true,
    }),
    new winston.transports.File({
      filename: "logs/http.log",
      level: "http",
      format: jsonFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 3,
      tailable: true,
    }),
  );
}

/**
 * [BUILD] Logger Instance
 */
const logger = winston.createLogger({
  level:
    process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === "development" ? "debug" : "info"),
  levels,
  transports,
  exitOnError: false,
});

/**
 *  Enhanced Logger with Typed Methods
 */
export class Logger {
  /**
   * Error: Critical errors that require immediate attention
   */
  static error(
    message: string,
    error?: Error | unknown,
    meta?: Record<string, unknown>,
  ) {
    const span = trace.getActiveSpan();

    if (error instanceof Error) {
      logger.error(message, {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        ...meta,
      });

      // Mark span as error if available
      if (span) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      }
    } else {
      logger.error(message, { error, ...meta });
    }
  }

  /**
   * Warning: Issues that should be addressed but aren't critical
   */
  static warn(message: string, meta?: Record<string, unknown>) {
    logger.warn(message, meta);
  }

  /**
   * Info: General informational messages
   */
  static info(message: string, meta?: Record<string, unknown>) {
    logger.info(message, meta);
  }

  /**
   * HTTP: HTTP request/response logging
   */
  static http(message: string, meta?: Record<string, unknown>) {
    logger.http(message, meta);
  }

  /**
   * Debug: Detailed debug information
   */
  static debug(message: string, meta?: Record<string, unknown>) {
    logger.debug(message, meta);
  }

  /**
   * [SEARCH] Log with custom trace span
   */
  static trace(
    spanName: string,
    fn: () => void | Promise<void>,
    meta?: Record<string, unknown>,
  ) {
    const tracer = trace.getTracer("sentry-crm-logger");
    return tracer.startActiveSpan(spanName, async (span) => {
      try {
        if (meta) {
          span.setAttributes(meta as Attributes);
        }
        await fn();
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        if (error instanceof Error) {
          span.recordException(error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
        }
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * [STAT] Log with performance timing
   */
  static timed(operation: string, meta?: Record<string, unknown>) {
    const start = Date.now();
    return {
      end: (additionalMeta?: Record<string, unknown>) => {
        const duration = Date.now() - start;
        logger.info(`[Performance] ${operation}`, {
          duration_ms: duration,
          ...meta,
          ...additionalMeta,
        });
      },
    };
  }
}

// Export raw winston logger for advanced usage
export const rawLogger = logger;

export default Logger;
