import { Router } from "express";
import {
  signup,
  login,
  updatePassword,
  forgotPassword,
  resetPassword,
} from "@/controllers/authController"; // Usar alias
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
} from "@/schemas/auth.schema";

const router = Router();

/**
 * 🔐 AUTHENTICATION ROUTES
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

export default router;
