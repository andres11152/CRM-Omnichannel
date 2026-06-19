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

// Queue Jobs (incremented per job event)
const queueJobs = new client.Counter({
  name: "queue_jobs_total",
  help: "Total queue jobs processed",
  labelNames: ["queue", "status"],
  registers: [register],
});

// BullMQ Queue Depth — real-time snapshot (Gauges, scraped by Prometheus)
const queueWaiting = new client.Gauge({
  name: "bullmq_queue_waiting",
  help: "Number of jobs waiting in queue",
  labelNames: ["queue"],
  registers: [register],
});

const queueActive = new client.Gauge({
  name: "bullmq_queue_active",
  help: "Number of jobs currently being processed",
  labelNames: ["queue"],
  registers: [register],
});

const queueFailed = new client.Gauge({
  name: "bullmq_queue_failed",
  help: "Number of jobs that failed (retained in DLQ)",
  labelNames: ["queue"],
  registers: [register],
});

const queueDelayed = new client.Gauge({
  name: "bullmq_queue_delayed",
  help: "Number of delayed jobs (scheduled for future execution)",
  labelNames: ["queue"],
  registers: [register],
});

const queueCompleted = new client.Gauge({
  name: "bullmq_queue_completed",
  help: "Number of completed jobs still retained",
  labelNames: ["queue"],
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

/**
 * Starts a background interval that scrapes BullMQ queue statistics
 * and updates Prometheus Gauges every `intervalMs`.
 * Call once after WhatsApp queues are initialized.
 */
export function startQueueMetricsScraper(intervalMs = 30_000): NodeJS.Timeout {
  const scrape = async () => {
    try {
      // Lazy-import to avoid circular deps during early startup
      const { getWhatsAppQueue } = await import("@/whatsapp/queue/WhatsAppQueue");
      const qm = getWhatsAppQueue();

      const queues = [
        { name: "whatsapp-inbound", q: qm.inboundQueue },
        { name: "whatsapp-outbound", q: qm.outboundQueue },
      ];

      for (const { name, q } of queues) {
        const [waiting, active, failed, delayed, completed] = await Promise.all([
          q.getWaitingCount(),
          q.getActiveCount(),
          q.getFailedCount(),
          q.getDelayedCount(),
          q.getCompletedCount(),
        ]);

        queueWaiting.set({ queue: name }, waiting);
        queueActive.set({ queue: name }, active);
        queueFailed.set({ queue: name }, failed);
        queueDelayed.set({ queue: name }, delayed);
        queueCompleted.set({ queue: name }, completed);
      }
    } catch {
      // Non-fatal — scraper will retry on next tick
    }
  };

  const handle = setInterval(scrape, intervalMs);
  handle.unref();
  // Run immediately on startup
  scrape().catch(() => {});
  return handle;
}

export { register };
