import { z } from "zod";

/**
 * 🔐 AUTHENTICATION SCHEMAS
 *
 * Validation for authentication and user management workflows.
 */

export const SignupSchema = z.object({
  body: z
    .object({
      name: z.string().min(1, { message: "El nombre no puede estar vacío." }),
      email: z.string().email({ message: "Email no válido." }),
      companyId: z.string().cuid().optional(),
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

export const LoginSchema = z.object({
  body: z.object({
    email: z.string().email({ message: "Email no válido." }),
    password: z
      .string()
      .min(1, { message: "La contraseña no puede estar vacía." }),
  }),
});

export const ForgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email({ message: "Email no válido." }),
  }),
});

export const ResetPasswordSchema = z.object({
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

export const UpdatePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z
        .string()
        .min(1, { message: "La contraseña actual es requerida." }),
      newPassword: z
        .string()
        .min(8, { message: "La contraseña debe tener al menos 8 caracteres." }),
      confirmPassword: z
        .string()
        .min(1, { message: "La confirmación de contraseña es requerida." }),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: "Las contraseñas no coinciden.",
      path: ["confirmPassword"],
    }),
});
