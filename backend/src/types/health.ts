export interface ServiceHealth {
  status: "up" | "down";
  responseTime?: number;
  error?: string;
}

export interface MemoryHealth {
  status: "ok" | "warning" | "critical";
  usedMB: number;
  totalMB: number;
  percentUsed: number;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    memory: MemoryHealth;
  };
}
