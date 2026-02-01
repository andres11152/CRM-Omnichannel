/**
 * 🔒 FLOW EXECUTOR TYPE DEFINITIONS
 *
 * Enterprise-grade type definitions for the chatbot flow executor engine.
 * Eliminates all `any` types for type safety and better IDE support.
 *
 * @module FlowSession
 * @version 1.0.0
 */

// ============================================================================
// 🔷 CORE FLOW SESSION TYPES
// ============================================================================

/**
 * Represents the runtime state of a contact's flow session.
 * Persisted in the `ContactFlowSession` table.
 */
export interface FlowSessionState {
  id: string;
  contactId: string;
  flowId: string; // Renamed from workflowId
  companyId: string;
  conversationId: string;
  currentNodeId: string | null;
  isActive: boolean;
  isPaused: boolean;
  variables: FlowVariables;
  visitedNodes: string[];
  startedAt?: Date;
  lastStepAt?: Date;
  completedAt?: Date | null;
}

/**
 * Variables captured during flow execution.
 * Keys are variable names (e.g., "name", "email", "phone"),
 * Values can be strings, numbers, or booleans.
 */
export type FlowVariables = Record<string, string | number | boolean>;

// ============================================================================
// 🔷 FLOW STRUCTURE TYPES (React Flow Schema)
// ============================================================================

/**
 * Types of nodes supported by the flow engine.
 */
export type FlowNodeType =
  | "START"
  | "END"
  | "SEND_MESSAGE"
  | "SEND_IMAGE"
  | "SEND_VIDEO"
  | "SEND_AUDIO"
  | "SEND_DOCUMENT"
  | "ASK_DATA"
  | "CONDITION"
  | "AI_AGENT"
  | "CREATE_DEAL"
  | "UPDATE_CONTACT"
  | "ASSIGN_AGENT"
  | "AI_HANDOFF"
  | "DELAY";

/**
 * Data payload for different node types.
 * Uses discriminated union for type safety.
 */
export interface FlowNodeData {
  // Common fields
  label?: string;
  description?: string;

  // SEND_MESSAGE / END
  message?: string;
  content?: string;
  text?: string;

  // SEND_IMAGE / SEND_VIDEO / SEND_AUDIO / SEND_DOCUMENT
  mediaUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  documentUrl?: string;
  filename?: string;

  // ASK_DATA
  variable?: string;
  question?: string;
  confirmation?: string;

  // CONDITION
  conditions?: FlowCondition[];

  // AI_AGENT
  aiAssistantId?: string;

  // CREATE_DEAL
  title?: string;
  value?: string;
  pipelineId?: string;
  stageId?: string;

  // UPDATE_CONTACT
  fields?: Record<string, string>;

  // ASSIGN_AGENT
  agentId?: string;
}

/**
 * Condition definition for CONDITION nodes.
 */
export interface FlowCondition {
  operator: "equals" | "contains" | "greater_than" | "less_than";
  value: string;
  targetHandle: string;
}

/**
 * Single node in the flow diagram.
 */
export interface FlowNode {
  id: string;
  type: FlowNodeType;
  data: FlowNodeData;
  position: { x: number; y: number };
}

/**
 * Edge connecting two nodes in the flow.
 */
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
}

/**
 * Complete flow structure (nodes + edges).
 */
export interface FlowStructure {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// ============================================================================
// 🔷 TRIGGER TYPES
// ============================================================================

/**
 * Trigger data for KEYWORD-based flows.
 */
export interface KeywordTriggerData {
  keywords: string[];
}

/**
 * Union type for all trigger data types.
 */
export type FlowTriggerData = KeywordTriggerData | Record<string, unknown>;

// ============================================================================
// 🔷 RESPONSE TYPES
// ============================================================================

/**
 * Media response returned by SEND_IMAGE, SEND_VIDEO, etc.
 */
export interface FlowMediaResponse {
  type: "image" | "video" | "audio" | "document";
  url: string;
  message?: string;
  filename?: string;
}

/**
 * Possible responses from flow execution.
 */
export type FlowExecutionResult = string | FlowMediaResponse | null;

// ============================================================================
// 🔷 SESSION UPDATE TYPES
// ============================================================================

/**
 * Partial update for flow session state.
 */
export interface FlowSessionUpdate {
  currentNodeId?: string | null;
  isPaused?: boolean;
  isActive?: boolean;
  variables?: FlowVariables;
  visitedNodes?: string[];
  lastStepAt?: Date;
  completedAt?: Date | null;
}

// ============================================================================
// 🔷 PRISMA ENTITY TYPES (Subset for flow operations)
// ============================================================================

/**
 * Minimal Flow entity from Prisma.
 */
export interface FlowEntity {
  id: string;
  companyId: string;
  name: string;
  isActive: boolean;
  triggerType: string;
  triggerData: FlowTriggerData | null;
  nodes: unknown; // JSON field - cast to FlowStructure when used
  priority: number;
  executionCount: number;
}

/**
 * AI Assistant entity for AI_AGENT nodes.
 */
export interface AIAssistantEntity {
  id: string;
  name: string;
  systemPrompt: string | null;
  modelName: string | null;
  temperature: number | null;
}
