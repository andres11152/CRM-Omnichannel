import { Logger } from "./logger";

/**
 * 🛡️ RESOURCE CLEANUP MANAGER
 *
 * Ensures all timers, intervals, and event listeners are properly cleaned up.
 * Prevents memory leaks in long-running processes.
 */

type CleanupFunction = () => void | Promise<void>;

class ResourceManager {
  private timers: Set<NodeJS.Timeout> = new Set();
  private intervals: Set<NodeJS.Timeout> = new Set();
  private cleanupFunctions: Set<CleanupFunction> = new Set();
  private isShuttingDown = false;

  /**
   * Register a timeout that will be auto-cleaned
   */
  setTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    if (this.isShuttingDown) {
      Logger.warn("[ResourceManager] Cannot create timer during shutdown");
      return setTimeout(() => {}, 0); // Return dummy timer
    }

    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delay);

    this.timers.add(timer);
    return timer;
  }

  /**
   * Register an interval that will be auto-cleaned
   */
  setInterval(callback: () => void, delay: number): NodeJS.Timeout {
    if (this.isShuttingDown) {
      Logger.warn("[ResourceManager] Cannot create interval during shutdown");
      return setTimeout(() => {}, 0); // Return dummy timer
    }

    const interval = setInterval(callback, delay);
    this.intervals.add(interval);
    return interval;
  }

  /**
   * Clear a specific timeout
   */
  clearTimeout(timer: NodeJS.Timeout): void {
    clearTimeout(timer);
    this.timers.delete(timer);
  }

  /**
   * Clear a specific interval
   */
  clearInterval(interval: NodeJS.Timeout): void {
    clearInterval(interval);
    this.intervals.delete(interval);
  }

  /**
   * Register a cleanup function to be called on shutdown
   */
  onCleanup(fn: CleanupFunction): void {
    this.cleanupFunctions.add(fn);
  }

  /**
   * Get current resource counts (for monitoring)
   */
  getStats() {
    return {
      timers: this.timers.size,
      intervals: this.intervals.size,
      cleanupFunctions: this.cleanupFunctions.size,
    };
  }

  /**
   * 🛡️ CLEANUP ALL RESOURCES
   *
   * Called on server shutdown to prevent memory leaks
   */
  async cleanup(): Promise<void> {
    if (this.isShuttingDown) {
      Logger.warn("[ResourceManager] Cleanup already in progress");
      return;
    }

    this.isShuttingDown = true;
    Logger.info("[ResourceManager] 🧹 Starting cleanup...");

    const stats = this.getStats();
    Logger.info(
      `[ResourceManager] Cleaning ${stats.timers} timers, ${stats.intervals} intervals, ${stats.cleanupFunctions} functions`
    );

    // Clear all timers
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();

    // Clear all intervals
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();

    // Run cleanup functions
    const cleanupPromises: Promise<void>[] = [];
    for (const fn of this.cleanupFunctions) {
      try {
        const result = fn();
        if (result instanceof Promise) {
          cleanupPromises.push(result);
        }
      } catch (error) {
        Logger.error("[ResourceManager] Cleanup function failed:", error);
      }
    }

    // Wait for all async cleanup
    await Promise.allSettled(cleanupPromises);
    this.cleanupFunctions.clear();

    Logger.info("[ResourceManager] ✅ Cleanup complete");
  }
}

// Singleton instance
export const resourceManager = new ResourceManager();

/**
 * 🛡️ AUTO-CLEANUP DECORATOR
 *
 * Automatically cleans up resources when a class instance is destroyed
 */
export function tracked(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
) {
  const originalMethod = descriptor.value;

  descriptor.value = function (...args: any[]) {
    const result = originalMethod.apply(this, args);

    // If result is a timer, track it
    if (result && typeof result === "object" && "ref" in result) {
      resourceManager.onCleanup(() => {
        if ("unref" in result) {
          (result as any).unref();
        }
      });
    }

    return result;
  };

  return descriptor;
}

/**
 * 🛡️ MEMORY MONITOR
 *
 * Watches memory usage and warns if it exceeds thresholds
 */
class MemoryMonitor {
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly WARNING_THRESHOLD = 0.75; // 75%
  private readonly CRITICAL_THRESHOLD = 0.9; // 90%

  start(intervalMs: number = 60000): void {
    if (this.checkInterval) {
      Logger.warn("[MemoryMonitor] Already running");
      return;
    }

    this.checkInterval = resourceManager.setInterval(() => {
      this.check();
    }, intervalMs);

    Logger.info(
      `[MemoryMonitor] Started monitoring (interval: ${intervalMs}ms)`
    );
  }

  stop(): void {
    if (this.checkInterval) {
      resourceManager.clearInterval(this.checkInterval);
      this.checkInterval = null;
      Logger.info("[MemoryMonitor] Stopped");
    }
  }

  check(): void {
    const usage = process.memoryUsage();
    const heapPercent = usage.heapUsed / usage.heapTotal;

    if (heapPercent >= this.CRITICAL_THRESHOLD) {
      Logger.error(
        `[MemoryMonitor] 🚨 CRITICAL: Memory usage at ${(
          heapPercent * 100
        ).toFixed(1)}%`,
        {
          heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
          rssMB: Math.round(usage.rss / 1024 / 1024),
        }
      );

      // Force garbage collection if available
      if (global.gc) {
        Logger.warn("[MemoryMonitor] Forcing garbage collection");
        global.gc();
      }
    } else if (heapPercent >= this.WARNING_THRESHOLD) {
      Logger.warn(
        `[MemoryMonitor] ⚠️ Memory usage at ${(heapPercent * 100).toFixed(1)}%`
      );
    }
  }
}

export const memoryMonitor = new MemoryMonitor();

// Auto-cleanup on process termination
const gracefulShutdown = async (signal: string) => {
  Logger.info(`[ResourceManager] ${signal} received. Cleaning up resources...`);
  memoryMonitor.stop();
  await resourceManager.cleanup();
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
