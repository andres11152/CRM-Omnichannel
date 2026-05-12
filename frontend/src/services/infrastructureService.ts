import { api } from "@/lib/axios";

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

export const infrastructureService = {
  async getDeepHealth(): Promise<InfrastructureStats> {
    const res = await api.get<InfrastructureStats>("/admin/analytics/infrastructure");
    return res.data;
  }
};
