import client from "prom-client";
import { Request, Response, NextFunction } from "express";

/**
 * [STAT] PROMETHEUS METRICS INTEGRATION
 * Production-grade APM for Node.js
 */

// Create a Registry
const register = new client.Registry();

// Add default metrics (CPU, Memory, Event Loop, etc.)
client.collectDefaultMetrics({
  register,
  prefix: "nodejs_",
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

//  Custom Business Metrics

// HTTP Request Duration
const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// HTTP Request Counter
const httpRequestTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

// Active Connections
const activeConnections = new client.Gauge({
  name: "active_connections",
  help: "Number of active connections",
  registers: [register],
});

// Database Query Duration
const dbQueryDuration = new client.Histogram({
  name: "db_query_duration_seconds",
  help: "Duration of database queries in seconds",
  labelNames: ["operation", "model"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register],
});

// Redis Operations
const redisOperations = new client.Counter({
  name: "redis_operations_total",
  help: "Total Redis operations",
  labelNames: ["operation", "status"],
  registers: [register],
});

// WhatsApp Sessions
const whatsappSessions = new client.Gauge({
  name: "whatsapp_sessions_total",
  help: "Total WhatsApp sessions",
  labelNames: ["status"],
  registers: [register],
});

// WhatsApp Messages
const whatsappMessages = new client.Counter({
  name: "whatsapp_messages_total",
  help: "Total WhatsApp messages processed",
  labelNames: ["direction", "status"],
  registers: [register],
});

// Queue Jobs
const queueJobs = new client.Counter({
  name: "queue_jobs_total",
  help: "Total queue jobs processed",
  labelNames: ["queue", "status"],
  registers: [register],
});

// Memory Usage (Heap)
const heapUsage = new client.Gauge({
  name: "nodejs_heap_usage_bytes",
  help: "Heap memory usage in bytes",
  labelNames: ["type"],
  registers: [register],
});

// Update heap metrics every 10 seconds
setInterval(() => {
  const usage = process.memoryUsage();
  heapUsage.set({ type: "used" }, usage.heapUsed);
  heapUsage.set({ type: "total" }, usage.heapTotal);
  heapUsage.set({ type: "external" }, usage.external);
  heapUsage.set({ type: "rss" }, usage.rss);
}, 10000);

/**
 * [STAT] Metrics Endpoint Handler
 */
export const metricsHandler = async (req: Request, res: Response) => {
  res.set("Content-Type", register.contentType);
  const metrics = await register.metrics();
  res.send(metrics);
};

/**
 * [STAT] Middleware to track HTTP metrics
 */
export const metricsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const start = Date.now();

  activeConnections.inc();

  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    const method = req.method;
    const statusCode = res.statusCode.toString();

    httpRequestDuration.observe(
      { method, route, status_code: statusCode },
      duration,
    );
    httpRequestTotal.inc({ method, route, status_code: statusCode });
    activeConnections.dec();
  });

  next();
};

/**
 * [STAT] Utility functions for business metrics
 */
export const metrics = {
  // Database
  trackDbQuery: (model: string, operation: string, duration: number) => {
    dbQueryDuration.observe({ model, operation }, duration / 1000);
  },

  // Redis
  trackRedisOperation: (operation: string, success: boolean) => {
    redisOperations.inc({
      operation,
      status: success ? "success" : "error",
    });
  },

  // WhatsApp
  updateWhatsAppSessions: (connected: number, disconnected: number) => {
    whatsappSessions.set({ status: "connected" }, connected);
    whatsappSessions.set({ status: "disconnected" }, disconnected);
  },

  trackWhatsAppMessage: (
    direction: "inbound" | "outbound",
    success: boolean,
  ) => {
    whatsappMessages.inc({
      direction,
      status: success ? "success" : "error",
    });
  },

  // Queues
  trackQueueJob: (queueName: string, success: boolean) => {
    queueJobs.inc({
      queue: queueName,
      status: success ? "completed" : "failed",
    });
  },
};

export { register };
