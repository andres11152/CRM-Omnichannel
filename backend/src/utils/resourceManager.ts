import { Logger } from "./logger";
import v8 from "v8";
import fs from "fs";
import os from "os";
import { whatsappService } from "@/whatsapp/WhatsAppService";

/**
 * Reads the REAL memory ceiling enforced on this process — the container's cgroup limit
 * (Render/Docker), not the V8 heap limit. Critical: --max-old-space-size can be far larger
 * than the container RAM, so heapUsed/heapLimit never crosses thresholds and the container
 * OOM-kills the process before the monitor reacts. Comparing RSS to the cgroup limit fixes
 * that. Cached after first read. Falls back to os.totalmem() when unconstrained.
 */
let cachedContainerLimit: number | null | undefined;
const getContainerMemoryLimitBytes = (): number | null => {
  if (cachedContainerLimit !== undefined) return cachedContainerLimit;
  const total = os.totalmem();
  const candidates = [
    "/sys/fs/cgroup/memory.max", // cgroup v2
    "/sys/fs/cgroup/memory/memory.limit_in_bytes", // cgroup v1
  ];
  let limit: number | null = null;
  for (const path of candidates) {
    try {
      const raw = fs.readFileSync(path, "utf8").trim();
      if (raw === "max") continue;
      const val = Number(raw);
      // Ignore the "unlimited" sentinel (a huge number close to int64 max) and bogus values.
      if (Number.isFinite(val) && val > 0 && val < total * 4) {
        limit = val;
        break;
      }
    } catch {
      // path not present (non-Linux / no cgroup) — try next
    }
  }
  cachedContainerLimit = limit ?? (Number.isFinite(total) && total > 0 ? total : null);
  return cachedContainerLimit;
};

/**
 * [SEC] RESOURCE CLEANUP MANAGER
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
   * [SEC] CLEANUP ALL RESOURCES
   *
   * Called on server shutdown to prevent memory leaks
   */
  async cleanup(): Promise<void> {
    if (this.isShuttingDown) {
      Logger.warn("[ResourceManager] Cleanup already in progress");
      return;
    }

    this.isShuttingDown = true;
    Logger.info("[ResourceManager]  Starting cleanup...");

    const stats = this.getStats();
    Logger.info(
      `[ResourceManager] Cleaning ${stats.timers} timers, ${stats.intervals} intervals, ${stats.cleanupFunctions} functions`,
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

    Logger.info("[ResourceManager] [OK] Cleanup complete");
  }
}

// Singleton instance
export const resourceManager = new ResourceManager();

/**
 * [SEC] AUTO-CLEANUP DECORATOR
 *
 * Automatically cleans up resources when a class instance is destroyed
 */
export function tracked(
  target: unknown,
  propertyKey: string,
  descriptor: PropertyDescriptor,
) {
  const originalMethod = descriptor.value;

  descriptor.value = function (...args: unknown[]) {
    const result = originalMethod.apply(this, args);

    // If result is a timer, track it
    if (result && typeof result === "object" && "ref" in result) {
      resourceManager.onCleanup(() => {
        if ("unref" in result) {
          (result as { unref: () => void }).unref();
        }
      });
    }

    return result;
  };

  return descriptor;
}

/**
 * [SEC] MEMORY MONITOR
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
      `[MemoryMonitor] Started monitoring (interval: ${intervalMs}ms)`,
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
    const v8Stats = v8.getHeapStatistics();
    const heapLimit = v8Stats.heap_size_limit;
    const heapPercent = usage.heapUsed / heapLimit;

    // RSS vs the container's real memory limit — this is what actually triggers an OOM kill
    // on Render. Use the WORST of (heap %, rss %) so we react before the container kills us.
    const containerLimit = getContainerMemoryLimitBytes();
    const rssPercent = containerLimit ? usage.rss / containerLimit : 0;
    const worstPercent = Math.max(heapPercent, rssPercent);

    if (worstPercent >= this.CRITICAL_THRESHOLD) {
      Logger.error(
        `[MemoryMonitor] [ALERT] CRITICAL: Memory at ${(worstPercent * 100).toFixed(1)}% ` +
          `(heap ${(heapPercent * 100).toFixed(0)}% / rss ${(rssPercent * 100).toFixed(0)}% of container)`,
        {
          heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
          heapTotalAllocatedMB: Math.round(usage.heapTotal / 1024 / 1024),
          heapLimitMB: Math.round(heapLimit / 1024 / 1024),
          rssMB: Math.round(usage.rss / 1024 / 1024),
          containerLimitMB: containerLimit ? Math.round(containerLimit / 1024 / 1024) : null,
        },
      );

      // [SEC] Memory is critical - GC will be forced below.
      // Store pruning is handled automatically by SimpleInMemoryStore's caps,
      // but under extreme pressure, we evict all caches.
      try {
        Logger.warn("[MemoryMonitor] Flushing all Baileys memory stores due to extreme pressure");
        whatsappService.getSessionManager().flushAllMemoryStores();
      } catch (err) {
        Logger.error("[MemoryMonitor] Failed to flush session stores:", err);
      }

      // Force garbage collection if available
      if (global.gc) {
        Logger.warn("[MemoryMonitor] Forcing garbage collection");
        global.gc();
      }
    } else if (worstPercent >= this.WARNING_THRESHOLD) {
      Logger.warn(
        `[MemoryMonitor] [WARNING] Memory at ${(worstPercent * 100).toFixed(1)}% ` +
          `(heap ${(heapPercent * 100).toFixed(0)}% / rss ${(rssPercent * 100).toFixed(0)}% of container)`,
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
