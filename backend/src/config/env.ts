import { z } from "zod";
import { Logger } from "@/utils/logger";

/**

/**
 * [SEC] ENVIRONMENT VALIDATOR (Zod-Powered)
 * 
 * Ensures all required environment variables are present and typed correctly.
 * FAIL FAST: The application will not start if validation fails.
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

  // [SEC] LOCAL-DEV ONLY. Media URLs attached to an outbound WhatsApp send are
  // built by the BROWSER (using its own view of the backend, e.g.
  // http://localhost:4000) and later fetched by whatsapp-service to build the
  // Baileys payload. In production both sides reach the same public HTTPS
  // domain, so this is a non-issue — but in the local docker-compose setup,
  // whatsapp-service runs in its OWN container, where `localhost` resolves to
  // the container itself, not the host machine running `npm run dev`
  // (ECONNREFUSED 127.0.0.1:4000). Set this to the host-reachable origin
  // (Docker Desktop: "http://host.docker.internal:4000") to rewrite ONLY the
  // outbound-to-whatsapp-service copy of the URL — the DB record and
  // frontend-facing URL are untouched. Leave unset in production.
  WA_MEDIA_FETCH_HOST_OVERRIDE: z
    .string()
    .url()
    .optional()
    .describe("Local-dev only: origin whatsapp-service's container should use instead of BACKEND_URL to fetch outbound media (e.g. http://host.docker.internal:4000)"),

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

  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters for encryption")
    .describe("Master secret for multi-tenant data encryption"),

  PREVIOUS_SESSION_SECRET: z
    .string()
    .min(32, "PREVIOUS_SESSION_SECRET must be at least 32 characters")
    .optional()
    .describe("Previous master secret for zero-downtime key rotation"),

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

  WA_SYNC_FULL_HISTORY: z.coerce
    .boolean()
    .default(false)
    .describe("Full history sync on new pairing"),

  // [SEC] Opt-in kill switch: group mutations (add/remove/promote participants,
  // subject/description/settings, invite links, leave) touch REAL, live WhatsApp
  // groups with real people — a bug here has consequences outside this app.
  // Defaults OFF; enable only after testing against a disposable test group.
  WA_ENABLE_GROUP_MANAGEMENT: z.coerce
    .boolean()
    .default(false)
    .describe("Enable WhatsApp group mutation actions (add/remove/promote participants, settings, invite links, leave)"),

  META_VERIFY_TOKEN: z.string().optional().describe("WhatsApp Meta Webhook verify token"),

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
  S3_BUCKET_NAME: z.string().optional().describe("AWS S3 Bucket name"),
  // Para emular S3 en local con MinIO: si se define, el S3Client usa este
  // endpoint + path-style. En prod NO se define → comportamiento AWS normal.
  S3_ENDPOINT: z.string().optional().describe("Custom S3 endpoint (e.g. MinIO http://localhost:9000)"),

  GOOGLE_AI_API_KEY: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  GLOBAL_PROXY_URL: z.string().optional().describe("Fallback global proxy URL with sticky sessions support"),

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
    console.error("\x1b[31m[CRITICAL] ENVIRONMENT VALIDATION FAILED\x1b[0m");
    console.error("Missing or invalid environment variables:");

    result.error.errors.forEach((err) => {
      const path = err.path.join(".");
      console.error(`  - \x1b[33m${path}\x1b[0m: ${err.message}`);
    });

    console.error("\nPlease check your Render Environment Variables or .env file.");
    process.exit(1);
    throw new Error("Env validation failed");
  }

  const parsed = result.data;
  cachedEnv = parsed; // Cache it immediately
  
  return parsed;
}

/**
 * Get typed environment variables.
 * Throws if not initialized to prevent silent failures.
 */
export function getEnv(): Env {
  if (!cachedEnv) {
    if (process.env.NODE_ENV === "test") {
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
  return validateEnv();
}

// Helpers
export const isDevelopment = () => (cachedEnv?.NODE_ENV || process.env.NODE_ENV) === "development";
export const isProduction = () => (cachedEnv?.NODE_ENV || process.env.NODE_ENV) === "production";
export const isTest = () => (cachedEnv?.NODE_ENV || process.env.NODE_ENV) === "test";
