/**
 *  FRONTEND LOGGER
 *
 * Type-safe logging utility for debugging
 */

type LogLevel = "info" | "warn" | "error" | "debug";

interface LoggerConfig {
  enabled: boolean;
  minLevel: LogLevel;
}

const config: LoggerConfig = {
  enabled: import.meta.env.DEV, // Only log in development
  minLevel: "info",
};

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class FrontendLogger {
  private shouldLog(level: LogLevel): boolean {
    if (!config.enabled) return false;
    return levels[level] >= levels[config.minLevel];
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog("info")) {
      console.log(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog("warn")) {
      console.warn(`[WARNING] ${message}`, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog("error")) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog("debug")) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }
}

export const Logger = new FrontendLogger();
