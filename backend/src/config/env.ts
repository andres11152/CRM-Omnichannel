import { z } from "zod";
import { Logger } from "@/utils/logger";

/**
 * 🛡️ ENVIRONMENT VARIABLES VALIDATION
 *
 * Validates all required environment variables at startup.
 * FAIL FAST: If any critical variable is missing, the app will not start.
 *
 * This prohibits direct process.env usage in favor of strict typed access.
 */

const EnvSchema = z.object({
  // ==================== CORE ====================
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development")
    .describe("Application environment"),

  PORT: z.coerce
    .number()
    .min(1)
    .max(65535)
    .default(3000)
    .describe("HTTP server port"),

  BACKEND_URL: z
    .string()
    .url()
    .default("http://localhost:4000")
    .describe("Public URL of the backend API"),

  // ==================== DATABASE ====================
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (url) => url.startsWith("postgresql://") || url.startsWith("postgres://"),
      "Database URL must start with postgresql:// or postgres://",
    )
    .describe("PostgreSQL connection string"),

  // ==================== SECURITY ====================
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters for security")
    .describe("Secret key for JWT token signing"),

  JWT_EXPIRES_IN: z
    .string()
    .default("7d")
    .describe("JWT token expiration time"),

  // ==================== REDIS ====================
  REDIS_URL: z
    .string()
    .url()
    .refine(
      (url) => url.startsWith("redis://") || url.startsWith("rediss://"),
      {
        message: "Must start with redis:// or rediss://",
      },
    )
    .describe("Redis connection string"),

  REDIS_PASSWORD: z.string().optional().describe("Redis password (optional)"),

  // ==================== WHATSAPP ====================
  WHATSAPP_SESSION_DIR: z
    .string()
    .default("./wa_sessions")
    .describe("Directory for WhatsApp session storage"),

  WA_RATE_LIMIT_MAX_MESSAGES: z.coerce
    .number()
    .positive()
    .default(100)
    .describe("Max messages per hour for WhatsApp"),

  WA_RATE_LIMIT_WINDOW_SECONDS: z.coerce
    .number()
    .positive()
    .default(3600)
    .describe("Rate limit window in seconds"),

  // ==================== CORS ====================
  FRONTEND_URL: z
    .string()
    .url()
    .optional()
    .describe("Frontend URL for CORS (optional in dev)"),

  ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(",").map((url) => url.trim()) : []))
    .pipe(z.array(z.string()))
    .describe("Comma-separated list of allowed origins"),

  // ==================== FILE STORAGE ====================
  UPLOAD_DIR: z
    .string()
    .default("./uploads")
    .describe("Directory for file uploads"),

  MAX_FILE_SIZE: z.coerce
    .number()
    .positive()
    .default(10485760) // 10 MB
    .describe("Maximum file size in bytes"),

  // ==================== OPTIONAL SERVICES ====================
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),

  GOOGLE_AI_API_KEY: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // ==================== MONITORING ====================
  SENTRY_DSN: z.string().url().optional(),

  LOG_LEVEL: z
    .enum(["error", "warn", "info", "debug"])
    .default("info")
    .describe("Logging level"),
});

export type Env = z.infer<typeof EnvSchema>;

let cachedEnv: Env | null = null;

/**
 * Validate and parse environment variables
 * FAIL FAST: Exits process if invalid.
 */
export function validateEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    Logger.error("❌ ENVIRONMENT VALIDATION FAILED");
    Logger.error("Missing or invalid environment variables:");

    result.error.errors.forEach((err) => {
      const path = err.path.join(".");
      Logger.error(`  ❌ ${path}: ${err.message}`);
    });

    Logger.error("Check your .env file.");
    process.exit(1);
    // TypeScript doesn't know process.exit() throws/ends, so we throw dummy error
    throw new Error("Env validation failed");
  }

  const parsed = result.data;
  Logger.info(`🌍 Running in ${parsed.NODE_ENV} mode`);

  if (parsed.NODE_ENV === "development") {
    Logger.info("✅ strict environment validation passed");
  }

  return parsed;
}

/**
 * Get typed environment variables.
 * Throws if not initialized to prevent silent failures.
 */
export function getEnv(): Env {
  if (!cachedEnv) {
    if (process.env.NODE_ENV === "test") {
      // Auto-init in test environment for convenience
      cachedEnv = validateEnv();
      return cachedEnv;
    }
    throw new Error(
      "getEnv() called before validateEnv(). Call initEnv() at startup.",
    );
  }
  return cachedEnv;
}

/**
 * Initialize environment. Call this in your entry point (e.g. server.ts).
 */
export function initEnv(): Env {
  cachedEnv = validateEnv();
  return cachedEnv;
}

// Helpers
export const isDevelopment = () => getEnv().NODE_ENV === "development";
export const isProduction = () => getEnv().NODE_ENV === "production";
export const isTest = () => getEnv().NODE_ENV === "test";
