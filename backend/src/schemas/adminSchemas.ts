import { z } from "zod";

export const createCompanySchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9-]+$/, "Slug must be kebab-case"),
  adminEmail: z.string().email("Invalid admin email"),
  password: z.string().min(6).optional(),
  planId: z.string().uuid("Invalid Plan ID"),
  logoUrl: z.string().url().optional().or(z.literal("")),
  smtpPassword: z.string().optional(),
});

export const updateCompanySchema = z.object({
  name: z.string().optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  planId: z.string().uuid().optional(),
  smtpPassword: z.string().optional(),
  status: z
    .enum(["ACTIVE", "INACTIVE", "TRIAL", "OVERDUE", "CANCELED", "BANNED"])
    .optional(),
  subscriptionEndsAt: z.union([z.string(), z.date(), z.null()]).optional(),
});

export const updateCompanyStatusSchema = z.object({
  status: z.enum([
    "ACTIVE",
    "INACTIVE",
    "TRIAL",
    "OVERDUE",
    "CANCELED",
    "BANNED",
  ]),
});

export const planConfigSchema = z
  .object({
    max_users: z.number().or(z.string().transform(Number)).optional(),
    maxLimitUsers: z.number().or(z.string().transform(Number)).optional(),
    max_whatsapp_connections: z
      .number()
      .or(z.string().transform(Number))
      .optional(),
    max_whatsapp_sessions: z
      .number()
      .or(z.string().transform(Number))
      .optional(),
    max_queues: z.number().or(z.string().transform(Number)).optional(),
    max_ai_assistants: z.number().or(z.string().transform(Number)).optional(),
    storage_limit_gb: z.number().or(z.string().transform(Number)).optional(),
    max_contacts: z.number().or(z.string().transform(Number)).optional(),
    max_companies: z.number().or(z.string().transform(Number)).optional(),
    max_workflows: z.number().or(z.string().transform(Number)).optional(),
  })
  .passthrough();

export const savePlanSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  price: z.number().min(0),
  config: planConfigSchema,
  storageLimitGb: z.number().nullable().optional(),
  maxContacts: z.number().nullable().optional(),
  maxCompanies: z.number().nullable().optional(),
  maxWorkflows: z.number().nullable().optional(),
});

export type CreateCompanyDto = z.infer<typeof createCompanySchema>;
export type UpdateCompanyDto = z.infer<typeof updateCompanySchema>;
export type UpdateCompanyStatusDto = z.infer<typeof updateCompanyStatusSchema>;
export type SavePlanDto = z.infer<typeof savePlanSchema>;
