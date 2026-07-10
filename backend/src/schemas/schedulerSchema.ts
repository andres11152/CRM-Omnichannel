import { z } from "zod";

export const GetSlotsSchema = z.object({
  query: z.object({
    companyId: z.string({ required_error: "companyId es requerido" }),
    agent: z.string({ required_error: "agent es requerido" }),
    meetingType: z.string({ required_error: "meetingType es requerido" }),
    date: z.string({ required_error: "date es requerido" }).regex(/^\d{4}-\d{2}-\d{2}$/, "El formato de fecha debe ser YYYY-MM-DD"),
  }),
});

export const BookMeetingSchema = z.object({
  body: z.object({
    companyId: z.string({ required_error: "companyId es requerido" }),
    agentSlugOrId: z.string({ required_error: "agentSlugOrId es requerido" }),
    meetingTypeSlug: z.string({ required_error: "meetingTypeSlug es requerido" }),
    startTime: z.string({ required_error: "startTime es requerido" }).datetime("Formato de fecha de inicio no válido"),
    guestName: z.string().min(1, "El nombre del invitado es requerido"),
    guestEmail: z.string().email("Debe ser un correo electrónico válido"),
    guestPhone: z.string().optional(),
    guestNotes: z.string().optional(),
  }),
});

export const SaveAvailabilitySchema = z.object({
  body: z.object({
    timezone: z.string().min(1, "La zona horaria es requerida"),
    rules: z.array(
      z.object({
        day: z.number().min(0).max(6),
        slots: z.array(
          z.object({
            start: z.string().regex(/^\d{2}:\d{2}$/, "Formato de hora de inicio debe ser HH:MM"),
            end: z.string().regex(/^\d{2}:\d{2}$/, "Formato de hora de fin debe ser HH:MM"),
          })
        ),
      })
    ),
  }),
});

export const CreateMeetingTypeSchema = z.object({
  body: z.object({
    name: z.string().min(1, "El nombre es requerido"),
    slug: z.string().regex(/^[a-z0-9-]+$/, "El slug debe ser alfanumérico en minúsculas y usar guiones"),
    description: z.string().optional(),
    duration: z.number().int().positive("La duración debe ser un número entero positivo"),
    isActive: z.boolean().optional().default(true),
  }),
});

export const UpdateMeetingTypeSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
  body: z.object({
    name: z.string().optional(),
    slug: z.string().regex(/^[a-z0-9-]+$/, "El slug debe ser alfanumérico en minúsculas y usar guiones").optional(),
    description: z.string().optional(),
    duration: z.number().int().positive("La duración debe ser un número entero positivo").optional(),
    isActive: z.boolean().optional(),
  }),
});

export const GetMeetingTypeInfoSchema = z.object({
  query: z.object({
    companySlug: z.string({ required_error: "companySlug es requerido" }),
    agentSlug: z.string({ required_error: "agentSlug es requerido" }),
    meetingTypeSlug: z.string({ required_error: "meetingTypeSlug es requerido" }),
  }),
});
