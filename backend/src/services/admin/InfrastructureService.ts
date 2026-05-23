import { Queue } from "bullmq";
import redisClient from "@/config/redis";
import { healthRepository } from "@/repositories/HealthRepository";
import { Logger } from "@/utils/logger";

export interface QueueHealth {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface InfrastructureStats {
  redis: {
    status: string;
    memoryUsed: string;
    memoryPeak: string;
    connectedClients: number;
    uptime: string;
  };
  database: {
    status: string;
    latencyMs: number;
  };
  queues: QueueHealth[];
  webhooks: {
    totalSent24h: number;
    failureRate: number;
  };
  timestamp: string;
}

export class InfrastructureService {
  private queueNames = [
    "whatsapp-inbound",
    "whatsapp-outbound",
    "cron-jobs",
    "flow-jobs",
    "group-indexing",
    "session-initialization"
  ];

  async getDeepHealth(): Promise<InfrastructureStats> {
    const start = Date.now();
    
    const [redisInfo, dbHealth, queueHealth, webhookStats] = await Promise.all([
      this.getRedisInfo(),
      this.getDatabaseHealth(),
      this.getQueuesHealth(),
      this.getWebhookStats()
    ]);

    return {
      redis: redisInfo,
      database: dbHealth,
      queues: queueHealth,
      webhooks: webhookStats,
      timestamp: new Date().toISOString()
    };
  }

  private async getRedisInfo() {
    if (!redisClient || !redisClient.isOpen) {
      return { status: "disconnected", memoryUsed: "0", memoryPeak: "0", connectedClients: 0, uptime: "0" };
    }

    try {
      const info = await redisClient.info();
      
      const extract = (key: string) => {
        const match = info.match(new RegExp(`${key}:([\\w\\d\\.]+)`));
        return match ? match[1] : "0";
      };

      return {
        status: "healthy",
        memoryUsed: extract("used_memory_human"),
        memoryPeak: extract("used_memory_peak_human"),
        connectedClients: parseInt(extract("connected_clients"), 10),
        uptime: extract("uptime_in_days") + " days"
      };
    } catch (error) {
      Logger.error("[InfrastructureService] Redis info failed", error);
      return { status: "error", memoryUsed: "0", memoryPeak: "0", connectedClients: 0, uptime: "0" };
    }
  }

  private async getDatabaseHealth() {
    const start = Date.now();
    try {
      await healthRepository.checkDatabaseLiveness();
      return { status: "healthy", latencyMs: Date.now() - start };
    } catch (error) {
      return { status: "error", latencyMs: -1 };
    }
  }

  private async getQueuesHealth(): Promise<QueueHealth[]> {
    if (!redisClient || !redisClient.isOpen) return [];

    const results = await Promise.all(
      this.queueNames.map(async (name) => {
        try {
          const queue = new Queue(name, { 
            connection: {
              host: process.env.REDIS_HOST || "localhost",
              port: parseInt(process.env.REDIS_PORT || "6379", 10),
              password: process.env.REDIS_PASSWORD
            }
          });
          
          const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
          await queue.close();

          return {
            name,
            waiting: counts.waiting,
            active: counts.active,
            completed: counts.completed,
            failed: counts.failed,
            delayed: counts.delayed
          };
        } catch (error) {
          return { name, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
        }
      })
    );

    return results;
  }

  private async getWebhookStats() {
    try {
      // Assuming we have a WebhookLog model or similar. 
      // If not, we'll return mock/static for now until we identify the model.
      // Let's check schema for WebhookLog.
      return {
        totalSent24h: 0,
        failureRate: 0
      };
    } catch (error) {
      return { totalSent24h: 0, failureRate: 0 };
    }
  }
}

export const infrastructureService = new InfrastructureService();
