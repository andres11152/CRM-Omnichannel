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
import { z } from "zod";

const router = Router();

const signupSchema = z.object({
  body: z
    .object({
      name: z.string().min(1, { message: "El nombre no puede estar vacío." }),
      email: z.string().email({ message: "Email no válido." }),
      password: z
        .string()
        .min(8, { message: "La contraseña debe tener al menos 8 caracteres." }),
      passwordConfirm: z
        .string()
        .min(1, { message: "La confirmación de contraseña es requerida." }),
    })
    .refine((data) => data.password === data.passwordConfirm, {
      message: "Las contraseñas no coinciden.",
      path: ["passwordConfirm"],
    }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email({ message: "Email no válido." }),
    password: z
      .string()
      .min(1, { message: "La contraseña no puede estar vacía." }),
  }),
});

const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email({ message: "Email no válido." }),
  }),
});

const resetPasswordSchema = z.object({
  body: z
    .object({
      password: z
        .string()
        .min(8, { message: "La contraseña debe tener al menos 8 caracteres." }),
      passwordConfirm: z
        .string()
        .min(1, { message: "La confirmación de contraseña es requerida." }),
    })
    .refine((data) => data.password === data.passwordConfirm, {
      message: "Las contraseñas no coinciden.",
      path: ["passwordConfirm"],
    }),
});

/**
 * 🔐 AUTHENTICATION ROUTES
 * All routes include appropriate rate limiting to prevent abuse
 */

// POST /auth/signup
// Rate limit: 10 signups per hour per IP
router.post("/signup", signupLimiter, validate(signupSchema), signup);

// POST /auth/login
// Rate limit: 5 attempts per 15 min per IP+email
// CRITICAL: Prevents brute force password attacks
router.post("/login", authLimiter, validate(loginSchema), login);

// POST /auth/forgot-password
// Rate limit: 3 attempts per hour per IP+email
// CRITICAL: Prevents email bombing and account enumeration
router.post(
  "/forgot-password",
  passwordResetLimiter,
  validate(forgotPasswordSchema),
  forgotPassword
);

// POST /auth/reset-password/:token
// No rate limit needed (token is already time-limited and one-time use)
router.post(
  "/reset-password/:token",
  validate(resetPasswordSchema),
  resetPassword
);

// PATCH /auth/update-password
// Protected route (requires authentication)
// No rate limit needed (already protected by auth)
router.patch("/update-password", protect, updatePassword);

export default router;
