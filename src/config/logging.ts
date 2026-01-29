import { Logger as MainLogger } from "@/utils/logger";
import { isDevelopment } from "@/config/env";

/**
 * ⚙️ LOGGING CONFIGURATION
 * Defines granular logging controls for specific sub-systems.
 *
 * Checks allow strictly disabling noisy modules even if global log level is debug.
 */
export const LogConfig = {
  // Global environment check
  environment: process.env.NODE_ENV || "development",

  // Enable/disable specific log categories
  prisma: {
    enabled: false,
    logLevel: ["error", "warn"],
  },

  whatsapp: { enabled: true },
  auth: { enabled: true },
  messageProcessor: { enabled: true },
  gateway: { enabled: true },
};

/**
 * ⚠️ DEPRECATED LEGACY LOGGER ADAPTER
 *
 * This adapter forwards logs to the main enterprise Winston logger (@/utils/logger).
 * New code should import { Logger } from "@/utils/logger" directly and use:
 * Logger.info("Message", { module: "WhatsApp", ...context });
 *
 * @deprecated Use "@/utils/logger" instead.
 */
export const Logger = {
  whatsapp: (message: string, ...args: unknown[]) => {
    if (LogConfig.whatsapp.enabled) {
      MainLogger.info(`[WhatsApp] ${message}`, { data: args });
    }
  },

  auth: (message: string, ...args: unknown[]) => {
    if (LogConfig.auth.enabled) {
      MainLogger.info(`[Auth] ${message}`, { data: args });
    }
  },

  messageProcessor: (message: string, ...args: unknown[]) => {
    if (LogConfig.messageProcessor.enabled) {
      MainLogger.info(`[MessageProcessor] ${message}`, { data: args });
    }
  },

  gateway: (message: string, ...args: unknown[]) => {
    if (LogConfig.gateway.enabled) {
      MainLogger.info(`[Gateway] ${message}`, { data: args });
    }
  },

  // Always log errors
  error: (message: string, error?: unknown) => {
    MainLogger.error(`[ERROR] ${message}`, error);
  },

  // Always log warnings
  warn: (message: string, ...args: unknown[]) => {
    MainLogger.warn(`[WARN] ${message}`, { data: args });
  },

  // General info (only in development or if verbose)
  info: (message: string, ...args: unknown[]) => {
    if (isDevelopment()) {
      MainLogger.info(`[INFO] ${message}`, { data: args });
    }
  },
};
