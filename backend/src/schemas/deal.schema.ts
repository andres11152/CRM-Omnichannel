import { z } from "zod";

/**
 * 🛡️ DEAL VALIDATION SCHEMAS
 *
 * Comprehensive validation for CRM Deal operations
 * Prevents data corruption, XSS, and ensures data integrity
 */

/**
 * Base deal validation rules
 */
const baseDealFields = {
  title: z
    .string()
    .min(2, "Deal title must be at least 2 characters")
    .max(200, "Deal title is too long (max 200 characters)")
    .trim()
    .transform((val) => val.replace(/\s+/g, " ")), // Remove extra whitespace

  value: z
    .union([
      z.number().nonnegative("Deal value must be positive"),
      z.string().transform((val) => {
        const num = parseFloat(val);
        if (isNaN(num) || num < 0) {
          throw new Error("Deal value must be a positive number");
        }
        return num;
      }),
    ])
    .default(0),

  currency: z
    .string()
    .length(
      3,
      "Currency code must be exactly 3 characters (e.g., USD, EUR, COP)",
    )
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Invalid currency code format")
    .default("USD"),

  pipelineId: z
    .string()
    .cuid("Invalid pipeline ID format")
    .min(1, "Pipeline ID is required"),

  stageId: z
    .string()
    .cuid("Invalid stage ID format")
    .min(1, "Stage ID is required"),

  contactId: z
    .string()
    .cuid("Invalid contact ID format")
    .optional()
    .or(z.literal(""))
    .transform((val) => (val === "" ? undefined : val)),

  accountId: z
    .string()
    .cuid("Invalid account ID format")
    .optional()
    .or(z.literal(""))
    .transform((val) => (val === "" ? undefined : val)),

  assignedToId: z
    .string()
    .cuid("Invalid user ID format")
    .optional()
    .or(z.literal(""))
    .transform((val) => (val === "" ? undefined : val)),

  probability: z
    .number()
    .min(0, "Probability must be at least 0")
    .max(100, "Probability cannot exceed 100")
    .default(10)
    .optional(),

  expectedCloseDate: z
    .string()
    .datetime("Invalid datetime format")
    .or(z.date())
    .optional()
    .or(z.literal(""))
    .transform((val) => {
      if (!val || val === "") return undefined;
      return typeof val === "string" ? new Date(val) : val;
    }),

  order: z
    .number()
    .nonnegative("Order must be non-negative")
    .default(0)
    .optional(),
};

/**
 * CREATE DEAL SCHEMA
 */
export const CreateDealSchema = z.object({
  body: z.object({
    title: baseDealFields.title,
    value: baseDealFields.value,
    currency: baseDealFields.currency,
    pipelineId: baseDealFields.pipelineId,
    stageId: baseDealFields.stageId,
    contactId: baseDealFields.contactId,
    accountId: baseDealFields.accountId,
    assignedToId: baseDealFields.assignedToId,
    probability: baseDealFields.probability,
    expectedCloseDate: baseDealFields.expectedCloseDate,
    order: baseDealFields.order,
  }),
});

/**
 * UPDATE DEAL SCHEMA
 * All fields optional (partial update)
 */
export const UpdateDealSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid deal ID format"),
  }),
  body: z
    .object({
      title: baseDealFields.title.optional(),
      value: baseDealFields.value.optional(),
      currency: baseDealFields.currency.optional(),
      pipelineId: baseDealFields.pipelineId.optional(),
      stageId: baseDealFields.stageId.optional(),
      contactId: baseDealFields.contactId,
      accountId: baseDealFields.accountId,
      assignedToId: baseDealFields.assignedToId,
      probability: baseDealFields.probability,
      expectedCloseDate: baseDealFields.expectedCloseDate,
      order: baseDealFields.order,
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
});

/**
 * UPDATE DEAL ORDER SCHEMA
 * For Kanban drag-and-drop reordering
 */
export const UpdateDealOrderSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid deal ID format"),
  }),
  body: z.object({
    stageId: z.string().cuid("Invalid stage ID format"),
    order: z.number().nonnegative("Order must be non-negative"),
  }),
});

/**
 * GET DEALS SCHEMA
 * Validates query parameters
 */
export const GetDealsSchema = z.object({
  query: z.object({
    pipelineId: z.string().cuid().optional(),
    stageId: z.string().cuid().optional(),
    contactId: z.string().cuid().optional(),
    accountId: z.string().cuid().optional(),
    assignedToId: z.string().cuid().optional(),
    limit: z
      .union([z.string(), z.number()])
      .default(50)
      .transform((val) => (typeof val === "string" ? parseInt(val, 10) : val))
      .pipe(z.number().min(1).max(100)),
    offset: z
      .union([z.string(), z.number()])
      .default(0)
      .transform((val) => (typeof val === "string" ? parseInt(val, 10) : val))
      .pipe(z.number().min(0)),
  }),
});

/**
 * GET DEAL BY ID SCHEMA
 */
export const GetDealSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid deal ID format"),
  }),
});

/**
 * DELETE DEAL SCHEMA
 */
export const DeleteDealSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid deal ID format"),
  }),
});

/**
 * Type exports for TypeScript inference
 */
export type CreateDealInput = z.infer<typeof CreateDealSchema>["body"];
export type UpdateDealInput = z.infer<typeof UpdateDealSchema>["body"];
export type UpdateDealOrderInput = z.infer<
  typeof UpdateDealOrderSchema
>["body"];
