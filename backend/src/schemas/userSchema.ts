import { z } from "zod";

/**
 *  USER VALIDATION SCHEMAS
 *
 * Comprehensive validation for user and agent operations
 */

export const CreateUserSchema = z.object({
  body: z.object({
    name: z.string().min(1, "El nombre es requerido."),
    email: z.string().email("Email no válido."),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres.")
      .optional(),
    role: z
      .enum(["USER", "AGENT", "SUPERVISOR", "ADMIN", "MASTER"])
      .optional()
      .default("AGENT"),
    phone: z.string().optional(),
    queueIds: z.array(z.string().cuid()).optional(),
  }),
});

export const UpdateUserSchema = z.object({
  body: z.object({
    name: z.string().min(1, "El nombre no puede estar vacío.").optional(),
    email: z.string().email("Email no válido.").optional(),
    phone: z.string().optional(),
    about: z.string().optional(),
    profilePicUrl: z.string().optional(),
    preferences: z.any().optional(),
    queueIds: z.array(z.string()).optional(),
    role: z.enum(["USER", "AGENT", "SUPERVISOR", "ADMIN", "MASTER"]).optional(),
    maxConcurrency: z.number().int().min(0).max(100).optional(),
    skills: z.array(z.string()).optional(),
  }),
  params: z
    .object({
      id: z.string().cuid("Id no válido").optional(),
    })
    .optional(),
});
