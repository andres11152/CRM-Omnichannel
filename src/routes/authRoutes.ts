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

router.post("/signup", validate(signupSchema), signup);
router.post("/login", validate(loginSchema), login);
router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);
router.post(
  "/reset-password/:token",
  validate(resetPasswordSchema),
  resetPassword
);

router.patch("/update-password", protect, updatePassword);

export default router;
