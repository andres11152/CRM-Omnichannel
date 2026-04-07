import { z } from "zod";
import { Router } from "express";
import {
  signup,
  login,
  logout,
  refreshToken,
  getActiveSessions,
  revokeSession,
  revokeAllSessions,
  updatePassword,
  forgotPassword,
  resetPassword,
} from "@/controllers/authController";
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import {
  authLimiter,
  passwordResetLimiter,
  signupLimiter,
} from "@/middleware/rateLimiters";
import {
  SignupSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  UpdatePasswordSchema,
} from "@/schemas/authSchema";

const router = Router();

/**
 * [AUTH] AUTHENTICATION ROUTES
 * All routes include appropriate rate limiting to prevent abuse
 */

// POST /auth/signup
// Rate limit: 10 signups per hour per IP
router.post("/signup", signupLimiter, validate(SignupSchema), signup);

// POST /auth/login
// Rate limit: 5 attempts per 15 min per IP+email
// CRITICAL: Prevents brute force password attacks
router.post("/login", authLimiter, validate(LoginSchema), login);

// POST /auth/forgot-password
// Rate limit: 3 attempts per hour per IP+email
// CRITICAL: Prevents email bombing and account enumeration
router.post(
  "/forgot-password",
  passwordResetLimiter,
  validate(ForgotPasswordSchema),
  forgotPassword,
);

// POST /auth/reset-password/:token
// No rate limit needed (token is already time-limited and one-time use)
router.post(
  "/reset-password/:token",
  validate(ResetPasswordSchema),
  resetPassword,
);

// PATCH /auth/update-password
// Protected route (requires authentication)
// No rate limit needed (already protected by auth)
router.patch(
  "/update-password",
  protect,
  validate(UpdatePasswordSchema),
  updatePassword,
);
//  ENTERPRISE: Server-side logout (destroy session + blacklist token)
router.post("/logout", protect, logout);

// [SYNC] TOKEN REFRESH: Exchange refresh cookie for new access token
// No protect needed — uses refresh_token cookie instead
router.post("/refresh", refreshToken);

//  ACTIVE SESSIONS: List/manage user's devices
router.get("/sessions", protect, getActiveSessions);
router.delete(
  "/sessions/:sessionId",
  protect,
  validate(
    z.object({
      params: z.object({
        sessionId: z.string().min(1, "Session ID is required"),
      }),
    }),
  ),
  revokeSession,
);
router.delete("/sessions", protect, revokeAllSessions);

export default router;
