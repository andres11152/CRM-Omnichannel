/**
 * Logging Configuration
 * Controls verbosity of console logs across the application
 */

export const LogConfig = {
  // Set to 'production' to reduce logs, 'development' for verbose
  environment: process.env.NODE_ENV || "development",

  // Enable/disable specific log categories
  prisma: {
    enabled: false, // Disable Prisma query logs by default
    logLevel: ["error", "warn"], // Only show errors and warnings
  },

  whatsapp: {
    enabled: true, // Keep WhatsApp logs for debugging
  },

  auth: {
    enabled: true, // Keep auth logs for security
  },

  messageProcessor: {
    enabled: true, // Keep message processor logs
  },

  gateway: {
    enabled: true, // Keep Socket.IO logs
  },
};

/**
 * Logger utility - use this instead of console.log
 */
export const Logger = {
  whatsapp: (message: string, ...args: any[]) => {
    if (LogConfig.whatsapp.enabled) {
      console.log(`[WhatsApp] ${message}`, ...args);
    }
  },

  auth: (message: string, ...args: any[]) => {
    if (LogConfig.auth.enabled) {
      console.log(`[Auth] ${message}`, ...args);
    }
  },

  messageProcessor: (message: string, ...args: any[]) => {
    if (LogConfig.messageProcessor.enabled) {
      console.log(`[MessageProcessor] ${message}`, ...args);
    }
  },

  gateway: (message: string, ...args: any[]) => {
    if (LogConfig.gateway.enabled) {
      console.log(`[Gateway] ${message}`, ...args);
    }
  },

  // Always log errors
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${message}`, error || "");
  },

  // Always log warnings
  warn: (message: string, ...args: any[]) => {
    console.warn(`[WARN] ${message}`, ...args);
  },

  // General info (only in development)
  info: (message: string, ...args: any[]) => {
    if (LogConfig.environment === "development") {
      console.log(`[INFO] ${message}`, ...args);
    }
  },
};
