import { Router } from "express";
import { signup, login, updatePassword } from "@/controllers/authController"; // Usar alias
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

router.post("/signup", validate(signupSchema), signup);
router.post("/login", validate(loginSchema), login);
router.patch("/update-password", protect, updatePassword);

export default router;
