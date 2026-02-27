import { z } from "zod";

/**
 * 🚀 ONBOARDING SCHEMAS
 *
 * Validation for onboarding a new company/tenant via registration endpoint
 */

export const OnboardingSchema = z.object({
  body: z.object({
    companyName: z
      .string()
      .min(2, {
        message: "El nombre de la empresa debe tener al menos 2 caracteres.",
      })
      .max(100, { message: "El nombre de la empresa es muy largo." }),
    adminEmail: z
      .string()
      .email({ message: "Por favor, proporciona un email válido." }),
    adminPassword: z
      .string()
      .min(8, { message: "La contraseña debe tener al menos 8 caracteres." })
      .regex(/[A-Z]/, {
        message: "La contraseña debe contener al menos una mayúscula.",
      })
      .regex(/[a-z]/, {
        message: "La contraseña debe contener al menos una minúscula.",
      })
      .regex(/[0-9]/, {
        message: "La contraseña debe contener al menos un número.",
      }),
    // Optional: enforce special char
    // .regex(/[^A-Za-z0-9]/, { message: "La contraseña debe contener al menos un caracter especial." }),
    plan: z.string().optional().default("free"),
    slug: z.string().optional(),
  }),
});
