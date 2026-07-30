import { z } from "zod";

/**
 * [DEV] PIPELINE & STAGE VALIDATION SCHEMAS
 *
 * Validation for CRM Pipeline and Stage operations.
 * Ensures data integrity for sales workflows.
 */

// ============================================================================
//  STAGE SCHEMAS
// ============================================================================

export const StageSchema = z.object({
  name: z
    .string()
    .min(1, "Stage name is required")
    .max(100, "Stage name too long")
    .trim(),
  color: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Invalid hex color code")
    .default("#6B7280")
    .optional(),
  order: z.number().int().min(0).optional(),
  // [SALES] Marks this stage as a closing stage for sales analytics
  // (forecast, conversion rate). At most one of these should be true.
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
});

export const CreateStageBodySchema = StageSchema;

export const UpdateStageBodySchema = StageSchema.partial();

export const ReorderStagesBodySchema = z.object({
  stages: z
    .array(
      z.object({
        id: z.string().cuid("Invalid stage ID"),
        order: z.number().int().min(0),
      }),
    )
    .min(1, "At least one stage is required"),
});

// ============================================================================
//  PIPELINE SCHEMAS
// ============================================================================

export const CreatePipelineBodySchema = z.object({
  name: z
    .string()
    .min(1, "Pipeline name is required")
    .max(100, "Pipeline name too long")
    .trim(),
  isDefault: z.boolean().default(false).optional(),
  stages: z.array(StageSchema).optional(),
});

export const UpdatePipelineBodySchema = z.object({
  name: z
    .string()
    .min(1, "Pipeline name is required")
    .max(100, "Pipeline name too long")
    .trim()
    .optional(),
  isDefault: z.boolean().optional(),
});

export const DuplicatePipelineBodySchema = z.object({
  name: z.string().trim().optional(),
});

// ============================================================================
// [SEARCH] PARAMS SCHEMAS
// ============================================================================

export const PipelineParamsSchema = z.object({
  id: z.string().cuid("Invalid pipeline ID"),
});

export const StageParamsSchema = z.object({
  pipelineId: z.string().cuid("Invalid pipeline ID"),
  id: z.string().cuid("Invalid stage ID").optional(),
});

// ============================================================================
//  TYPE EXPORTS
// ============================================================================

export type CreatePipelineInput = z.infer<typeof CreatePipelineBodySchema>;
export type UpdatePipelineInput = z.infer<typeof UpdatePipelineBodySchema>;
export type CreateStageInput = z.infer<typeof CreateStageBodySchema>;
export type UpdateStageInput = z.infer<typeof UpdateStageBodySchema>;
export type ReorderStagesInput = z.infer<typeof ReorderStagesBodySchema>;
