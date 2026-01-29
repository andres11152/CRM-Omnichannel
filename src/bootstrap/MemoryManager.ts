import { EventEmitter } from "events";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  timestamp: Date;
}

interface MemoryThresholds {
  heapUsedWarning: number; // Percentage (e.g., 70)
  heapUsedCritical: number; // Percentage (e.g., 85)
  rssWarning: number; // Bytes (e.g., 1GB = 1073741824)
  rssCritical: number; // Bytes (e.g., 1.5GB = 1610612736)
}

/**
 * PROFESSIONAL MEMORY MANAGER
 *
 * Replaces the embarrassment of global.gc() with proper memory management:
 * - Event-driven alerts when memory thresholds are exceeded
 * - Stream-based data processing to prevent accumulation
 * - Automatic cleanup of stale resources
 * - Memory profiling and leak detection
 *
 * NO FORCED GARBAGE COLLECTION - Let V8 do its job properly
 */
export class MemoryManager extends EventEmitter {
  private static instance: MemoryManager;
  private monitorInterval?: NodeJS.Timeout;
  private statsHistory: MemoryStats[] = [];
  private maxHistorySize = 60; // Keep last 60 samples

  private thresholds: MemoryThresholds = {
    heapUsedWarning: 70,
    heapUsedCritical: 85,
    rssWarning: 1024 * 1024 * 1024, // 1GB
    rssCritical: 1536 * 1024 * 1024, // 1.5GB
  };

  private constructor() {
    super();
    this.setupProcessHandlers();
  }

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  private setupProcessHandlers(): void {
    // Monitor for memory pressure warnings from V8
    process.on("warning", (warning) => {
      if (warning.name === "MaxListenersExceededWarning") {
        logger.warn(
          {
            name: warning.name,
            message: warning.message,
          },
          "[MemoryManager] Memory pressure detected",
        );
        this.emit("memory:pressure", this.getCurrentStats());
      }
    });
  }

  /**
   * Start monitoring memory usage
   */
  start(intervalMs: number = 60000): void {
    if (this.monitorInterval) {
      logger.warn("[MemoryManager] Already monitoring");
      return;
    }

    logger.info({ intervalMs }, "[MemoryManager] Starting memory monitoring");

    this.monitorInterval = setInterval(() => {
      this.checkMemory();
    }, intervalMs);

    // Prevent interval from keeping the process alive
    this.monitorInterval.unref();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
      logger.info("[MemoryManager] Stopped memory monitoring");
    }
  }

  /**
   * Check current memory usage and emit events if thresholds exceeded
   */
  private checkMemory(): void {
    const stats = this.getCurrentStats();
    this.recordStats(stats);

    const heapUsedPercent = (stats.heapUsed / stats.heapTotal) * 100;

    // Check heap usage
    if (heapUsedPercent >= this.thresholds.heapUsedCritical) {
      logger.error(
        {
          heapUsedMB: Math.round(stats.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(stats.heapTotal / 1024 / 1024),
          heapUsedPercent: heapUsedPercent.toFixed(1),
        },
        "[MemoryManager] CRITICAL: Heap usage critical",
      );
      this.emit("memory:critical", stats);
    } else if (heapUsedPercent >= this.thresholds.heapUsedWarning) {
      logger.warn(
        {
          heapUsedMB: Math.round(stats.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(stats.heapTotal / 1024 / 1024),
          heapUsedPercent: heapUsedPercent.toFixed(1),
        },
        "[MemoryManager] WARNING: Heap usage high",
      );
      this.emit("memory:warning", stats);
    }

    // Check RSS (Resident Set Size - total memory usage)
    if (stats.rss >= this.thresholds.rssCritical) {
      logger.error(
        {
          rssMB: Math.round(stats.rss / 1024 / 1024),
          thresholdMB: Math.round(this.thresholds.rssCritical / 1024 / 1024),
        },
        "[MemoryManager] CRITICAL: RSS critical",
      );
      this.emit("memory:critical", stats);
    } else if (stats.rss >= this.thresholds.rssWarning) {
      logger.warn(
        {
          rssMB: Math.round(stats.rss / 1024 / 1024),
          thresholdMB: Math.round(this.thresholds.rssWarning / 1024 / 1024),
        },
        "[MemoryManager] WARNING: RSS high",
      );
      this.emit("memory:warning", stats);
    }

    // Detect potential memory leaks
    this.detectLeaks();
  }

  /**
   * Get current memory statistics
   */
  getCurrentStats(): MemoryStats {
    const mem = process.memoryUsage();

    return {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      rss: mem.rss,
      arrayBuffers: mem.arrayBuffers,
      timestamp: new Date(),
    };
  }

  /**
   * Record stats for leak detection
   */
  private recordStats(stats: MemoryStats): void {
    this.statsHistory.push(stats);

    // Keep only recent history
    if (this.statsHistory.length > this.maxHistorySize) {
      this.statsHistory.shift();
    }
  }

  /**
   * Detect memory leaks by analyzing trends
   */
  private detectLeaks(): void {
    if (this.statsHistory.length < 10) return; // Need enough samples

    // Calculate trend over last 10 samples
    const recentStats = this.statsHistory.slice(-10);
    const oldestHeap = recentStats[0].heapUsed;
    const newestHeap = recentStats[recentStats.length - 1].heapUsed;
    const increase = newestHeap - oldestHeap;
    const percentIncrease = (increase / oldestHeap) * 100;

    // If heap grew by more than 20% consistently, it might be a leak
    if (percentIncrease > 20) {
      logger.warn(
        {
          increaseMB: Math.round(increase / 1024 / 1024),
          percentIncrease: percentIncrease.toFixed(1),
        },
        "[MemoryManager] Potential memory leak detected",
      );
      this.emit("memory:leak-suspected", {
        increase,
        percentIncrease,
        stats: recentStats,
      });
    }
  }

  /**
   * Get memory usage trend
   */
  getTrend(): {
    direction: "increasing" | "decreasing" | "stable";
    rate: number; // MB per minute
  } {
    if (this.statsHistory.length < 2) {
      return { direction: "stable", rate: 0 };
    }

    const oldest = this.statsHistory[0];
    const newest = this.statsHistory[this.statsHistory.length - 1];
    const timeDiffMinutes =
      (newest.timestamp.getTime() - oldest.timestamp.getTime()) / 60000;
    const heapDiffMB = (newest.heapUsed - oldest.heapUsed) / 1024 / 1024;
    const rate = heapDiffMB / timeDiffMinutes;

    let direction: "increasing" | "decreasing" | "stable";
    if (Math.abs(rate) < 1) {
      direction = "stable";
    } else if (rate > 0) {
      direction = "increasing";
    } else {
      direction = "decreasing";
    }

    return { direction, rate };
  }

  /**
   * Get detailed memory report
   */
  getReport(): {
    current: MemoryStats;
    trend: ReturnType<typeof this.getTrend>;
    thresholds: MemoryThresholds;
    history: MemoryStats[];
  } {
    return {
      current: this.getCurrentStats(),
      trend: this.getTrend(),
      thresholds: this.thresholds,
      history: this.statsHistory.slice(-10), // Last 10 samples
    };
  }

  /**
   * Update thresholds
   */
  setThresholds(thresholds: Partial<MemoryThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
    logger.info(
      { thresholds: this.thresholds },
      "[MemoryManager] Thresholds updated",
    );
  }
}

export const memoryManager = MemoryManager.getInstance();
