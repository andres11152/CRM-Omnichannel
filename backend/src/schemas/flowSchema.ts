import { z } from "zod";

/**
 * [SEC] FLOW (WORKFLOW) VALIDATION SCHEMAS
 *
 * Prevents arbitrary JSON injection into the workflow engine.
 * All Zod schemas follow the { body, params, query } convention.
 */

// --- Reusable Types ---
const JsonValue = z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.unknown()), z.record(z.unknown())]);

// --- Schemas ---

export const CreateFlowSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Workflow name is required.").max(100),
    triggerType: z.string().optional().default("KEYWORD"),
    triggerConfig: JsonValue.optional(),
    nodes: z.array(z.record(z.unknown())).optional(),
    edges: z.array(z.record(z.unknown())).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const UpdateFlowSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Flow ID is required."),
  }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    triggerType: z.string().optional(),
    triggerConfig: JsonValue.optional(),
    nodes: z.array(z.record(z.unknown())).optional(),
    edges: z.array(z.record(z.unknown())).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const FlowIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Flow ID is required."),
  }),
});

// --- Inferred Types ---
export type CreateFlowInput = z.infer<typeof CreateFlowSchema>["body"];
export type UpdateFlowInput = z.infer<typeof UpdateFlowSchema>["body"];
