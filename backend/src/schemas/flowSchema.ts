import { z } from "zod";

/**
 * [SEC] FLOW (WORKFLOW) VALIDATION SCHEMAS
 *
 * Prevents arbitrary JSON injection into the workflow engine.
 * All Zod schemas follow the { body, params, query } convention.
 */

// --- Reusable Types ---
const JsonValue = z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.unknown()), z.record(z.unknown())]);

export const FlowNodeTypeSchema = z.enum([
  "START",
  "END",
  "SEND_MESSAGE",
  "SEND_IMAGE",
  "SEND_VIDEO",
  "SEND_AUDIO",
  "SEND_DOCUMENT",
  "ASK_DATA",
  "CONDITION",
  "AI_AGENT",
  "CREATE_DEAL",
  "UPDATE_CONTACT",
  "ASSIGN_AGENT",
  "AI_HANDOFF",
  "HTTP_REQUEST",
  "TAG_CONTACT",
  "SEND_TEMPLATE",
  "DELAY",
]);

export const FlowConditionSchema = z.object({
  operator: z.enum([
    "equals",
    "contains",
    "greater_than",
    "less_than",
    "starts_with",
    "ends_with",
    "regex",
    "is_empty",
  ]),
  value: z.string(),
  targetHandle: z.string(),
});

export const FlowNodeDataSchema = z.object({
  label: z.string().optional(),
  description: z.string().optional(),
  message: z.string().optional(),
  content: z.string().optional(),
  text: z.string().optional(),
  mediaUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  audioUrl: z.string().optional(),
  documentUrl: z.string().optional(),
  filename: z.string().optional(),
  variable: z.string().optional(),
  question: z.string().optional(),
  confirmation: z.string().optional(),
  conditions: z.array(FlowConditionSchema).optional(),
  conditionOperator: z.string().optional(),
  conditionValue: z.string().optional(),
  conditionVariable: z.string().optional(),
  aiAssistantId: z.string().optional(),
  title: z.string().optional(),
  value: z.string().optional(),
  pipelineId: z.string().optional(),
  stageId: z.string().optional(),
  fields: z.record(z.string()).optional(),
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  customFields: z.string().optional(),
  assignmentType: z.enum(["agent", "queue"]).optional(),
  agentId: z.string().optional(),
  queueId: z.string().optional(),
  webhookUrl: z.string().optional(),
  url: z.string().optional(),
  httpMethod: z.string().optional(),
  authHeader: z.string().optional(),
  bodyTemplate: z.string().optional(),
  errorNodeId: z.string().optional(),
  tags: z.string().optional(),
  tag: z.string().optional(),
  templateName: z.string().optional(),
  templateParams: z.array(z.string()).optional(),
  delayValue: z.string().optional(),
  delayUnit: z.string().optional(),
}).catchall(z.unknown());

export const FlowNodeSchema = z.object({
  id: z.string().min(1, "Node ID is required."),
  type: FlowNodeTypeSchema,
  data: FlowNodeDataSchema,
  position: z.object({
    x: z.number(),
    y: z.number(),
  }).optional(),
}).catchall(z.unknown());

export const FlowEdgeSchema = z.object({
  id: z.string().min(1, "Edge ID is required."),
  source: z.string().min(1, "Edge source is required."),
  target: z.string().min(1, "Edge target is required."),
  sourceHandle: z.string().optional().nullable(),
  targetHandle: z.string().optional().nullable(),
  label: z.string().optional(),
}).catchall(z.unknown());

// --- Schemas ---

export const CreateFlowSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Workflow name is required.").max(100),
    triggerType: z.string().optional().default("KEYWORD"),
    triggerConfig: JsonValue.optional(),
    nodes: z.array(FlowNodeSchema).optional(),
    edges: z.array(FlowEdgeSchema).optional(),
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
    nodes: z.array(FlowNodeSchema).optional(),
    edges: z.array(FlowEdgeSchema).optional(),
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

