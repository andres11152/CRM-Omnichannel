import { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { Logger } from "@/utils/logger";

/**
 * [SEC] SECURITY MIDDLEWARE
 *
 * Configures production-grade security:
 * - Helmet for HTTP headers
 * - CORS with environment-based allowlist
 * - CSP headers
 */
export const securityMiddleware = (app: Express) => {
  const isDevelopment = process.env.NODE_ENV !== "production";

  // ==================== HELMET CONFIGURATION ====================
  // Helmet sets various HTTP headers to protect against common attacks
  app.use(
    helmet({
      // Content Security Policy
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Required for development
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https:"],
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },

      // Cross-Origin-Embedder-Policy
      crossOriginEmbedderPolicy: false, // Disable for third-party integrations

      // Cross-Origin-Resource-Policy
      crossOriginResourcePolicy: { policy: "cross-origin" },

      // Hide X-Powered-By header (don't reveal Express)
      hidePoweredBy: true,

      // HTTP Strict Transport Security (HSTS)
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },

      // Prevent MIME type sniffing
      noSniff: true,

      // Prevent clickjacking
      frameguard: {
        action: "deny",
      },

      // XSS Protection (legacy browsers)
      xssFilter: true,
    }),
  );

  // ==================== CORS CONFIGURATION ====================
  // Build allowlist based on environment
  const defaultOrigins = [
    "http://localhost:5173", // Vite dev
    "http://localhost:5174", // Secondary dev
    "http://localhost:3000", // React dev
  ];

  const productionOrigins: string[] = [];

  // Parse additional origins from environment
  const envOrigins: string[] = [];

  if (process.env.FRONTEND_URL) {
    envOrigins.push(process.env.FRONTEND_URL.replace(/\/$/, ""));
  }

  if (process.env.CORS_ORIGINS) {
    process.env.CORS_ORIGINS.split(",").forEach((origin) => {
      const trimmed = origin.trim().replace(/\/$/, "");
      if (trimmed) envOrigins.push(trimmed);
    });
  }

  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(",").forEach((origin) => {
      const trimmed = origin.trim().replace(/\/$/, "");
      if (trimmed) envOrigins.push(trimmed);
    });
  }

  // Combine origins based on environment
  const allowedOrigins = [
    ...new Set([
      ...(isDevelopment ? defaultOrigins : []),
      ...productionOrigins,
      ...envOrigins,
    ]),
  ];

  Logger.info(`[CORS] [SEC] Allowed origins: ${JSON.stringify(allowedOrigins)}`);
  Logger.info(
    `[CORS]  Environment: ${process.env.NODE_ENV || "development"}`,
  );

  // Configure CORS
  const corsOptions = {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (mobile apps, Postman, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // Check if origin is allowed (exact match)
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // [SEC] 100-YEAR FIX: Allow all subdomains of reply.software
      if (
        origin.endsWith(".reply.software") ||
        origin === "https://reply.software"
      ) {
        return callback(null, true);
      }

      // Log rejected origins in production for monitoring
      if (!isDevelopment) {
        Logger.warn(`[CORS] [WARNING] Rejected origin: ${origin}`);
      }

      // In production: strict enforcement
      // In development: allow all (for easier testing)
      if (isDevelopment) {
        return callback(null, true);
      } else {
        return callback(new Error(`CORS: Origin ${origin} not allowed`));
      }
    },

    // Allow cookies and authorization headers
    credentials: true,

    // Allowed HTTP methods
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],

    // Allowed request headers
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
      "X-CSRF-Token",
      "X-Impersonate-User",
    ],

    // Exposed response headers
    exposedHeaders: [
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
    ],

    // Preflight cache duration (24 hours)
    maxAge: 86400,
  };

  app.use(cors(corsOptions));

  // Additional security headers
  app.use((req, res, next) => {
    // Prevent DNS prefetching
    res.setHeader("X-DNS-Prefetch-Control", "off");

    // Prevent download of executable files
    res.setHeader("X-Download-Options", "noopen");

    // Prevent browser from MIME-sniffing
    res.setHeader("X-Content-Type-Options", "nosniff");

    // Referrer Policy
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    next();
  });
};
