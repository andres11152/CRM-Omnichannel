import rateLimit from "express-rate-limit";
import { Request } from "express";
import { Logger } from "@/utils/logger";

/**
 * 🛡️ RATE LIMITERS
 *
 * Collection of rate limiting middlewares for different endpoints.
 * Prevents brute force attacks, credential stuffing, and abuse.
 */

/**
 * 🔐 AUTH RATE LIMITER (Login & Password Reset)
 *
 * Strict limiter for authentication endpoints to prevent:
 * - Brute force password attacks
 * - Credential stuffing
 * - Account enumeration
 *
 * Configuration:
 * - Window: 15 minutes
 * - Max attempts: 5 per IP+email combination
 * - Why IP+email: Prevents blocking entire offices sharing one IP
 *   while still protecting individual accounts from brute force
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50000, // 🛡️ DEV MODE: Increased limit for testing (was 500)

  // Message returned when rate limit is exceeded
  message: {
    success: false,
    message: "Too many login attempts, please try again after 15 minutes",
  },

  // Include rate limit info in headers
  standardHeaders: true, // Return rate limit info in 'RateLimit-*' headers
  legacyHeaders: false, // Disable 'X-RateLimit-*' headers

  /**
   * CRITICAL: Custom key generator
   * Combines IP + email to:
   * 1. Protect specific accounts from brute force (even from different IPs)
   * 2. Prevent blocking entire offices/companies sharing one IP
   * 3. Allow legitimate users from same IP to login
   */
  keyGenerator: (req: Request): string => {
    // Get client IP (handles proxies and load balancers)
    const ip =
      req.ip ||
      req.headers["x-forwarded-for"] ||
      req.headers["x-real-ip"] ||
      req.socket.remoteAddress ||
      "unknown";

    // Get email from request body (if available)
    const email = req.body?.email || "";

    // Combine IP + email for unique key
    // Examples:
    // - "192.168.1.100:john@test.com"
    // - "203.0.113.42:admin@company.com"
    const key = email ? `${ip}:${email}` : String(ip);

    return key;
  },

  /**
   * Custom handler for when limit is exceeded
   * Logs the attempt for security monitoring
   */
  handler: (req, res) => {
    const email = req.body?.email || "unknown";
    const ip = req.ip || "unknown";

    Logger.warn(`[Rate Limit] Login attempt blocked: ${email} from ${ip}`);

    // Return 429 Too Many Requests
    res.status(429).json({
      success: false,
      message: "Too many login attempts, please try again after 15 minutes",
      retryAfter: "15 minutes",
    });
  },

  /**
   * Skip rate limiting for successful requests (optional)
   * This allows unlimited successful logins, only limiting failed attempts
   *
   * Disabled by default - uncomment if you want to only count failed attempts
   */
  // skipSuccessfulRequests: true,

  /**
   * Skip failed requests (opposite of above)
   * This would only limit successful logins, not failures
   *
   * Keep disabled to limit all attempts
   */
  skipFailedRequests: false,
});

/**
 * 📧 PASSWORD RESET LIMITER
 *
 * Stricter limiter for password reset to prevent:
 * - Email bombing (sending many reset emails)
 * - Account enumeration
 *
 * Configuration:
 * - Window: 1 hour
 * - Max attempts: 3 per IP+email
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Max 3 password reset attempts

  message: {
    success: false,
    message: "Too many password reset attempts, please try again after 1 hour",
  },

  standardHeaders: true,
  legacyHeaders: false,

  // Same IP+email key generator
  keyGenerator: (req: Request): string => {
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const email = req.body?.email || "";
    return email ? `${ip}:${email}` : String(ip);
  },

  handler: (req, res) => {
    const email = req.body?.email || "unknown";
    const ip = req.ip || "unknown";

    Logger.warn(`[Rate Limit] Password reset blocked: ${email} from ${ip}`);

    res.status(429).json({
      success: false,
      message:
        "Too many password reset attempts, please try again after 1 hour",
      retryAfter: "1 hour",
    });
  },
});

/**
 * 🌐 GENERAL API LIMITER (Global)
 *
 * Loose limiter for general API endpoints.
 * Prevents aggressive abuse without impacting normal users.
 *
 * Configuration:
 * - Window: 15 minutes
 * - Max: 100 requests
 * - By IP only (not email-specific)
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // Max 5000 requests per IP (Dev Mode)

  message: {
    success: false,
    message: "Too many requests from this IP, please try again later",
  },

  standardHeaders: true,
  legacyHeaders: false,

  // Simple IP-based key generator
  keyGenerator: (req: Request): string => {
    return String(req.ip || req.headers["x-forwarded-for"] || "unknown");
  },

  handler: (req, res) => {
    const ip = req.ip || "unknown";
    Logger.warn(`[Rate Limit] API limit exceeded for IP: ${ip}`);

    res.status(429).json({
      success: false,
      message: "Too many requests, please try again later",
    });
  },
});

/**
 * 📱 SIGNUP LIMITER
 *
 * Moderate limiter for signup endpoint.
 * Prevents mass account creation abuse.
 *
 * Configuration:
 * - Window: 1 hour
 * - Max: 10 signups per IP
 */
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // Max 100 signups per hour per IP (Dev Mode)

  message: {
    success: false,
    message:
      "Too many accounts created from this IP, please try again after 1 hour",
  },

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req: Request): string => {
    return String(req.ip || req.headers["x-forwarded-for"] || "unknown");
  },

  handler: (req, res) => {
    const ip = req.ip || "unknown";
    Logger.warn(`[Rate Limit] Signup limit exceeded for IP: ${ip}`);

    res.status(429).json({
      success: false,
      message: "Too many accounts created, please try again later",
    });
  },
});

/**
 * USAGE EXAMPLES:
 *
 * // In routes/authRoutes.ts
 * import { authLimiter, passwordResetLimiter } from '@/middleware/rateLimiters';
 *
 * router.post('/login', authLimiter, validate(loginSchema), login);
 * router.post('/forgot-password', passwordResetLimiter, forgotPassword);
 *
 * // In server.ts (global)
 * import { apiLimiter } from '@/middleware/rateLimiters';
 * app.use('/api/', apiLimiter);
 */
