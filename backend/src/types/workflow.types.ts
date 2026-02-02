import { Prisma } from "@prisma/client";

export interface DealPayload {
  dealId: string;
  companyId: string;
  previousStage?: string;
  newStage?: string;
}

export interface WorkflowTriggerConfig {
  event: string;
  condition?: {
    stage?: string;
    [key: string]: unknown;
  };
}

export interface WorkflowNodeData {
  options?: string[];
  params?: {
    subject?: string;
    body?: string;
    [key: string]: unknown;
  };
  content?: string;
  label?: string;
}

export interface WorkflowNode {
  id: string;
  type: string;
  data?: WorkflowNodeData;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  nodes: Prisma.JsonValue;
  companyId: string;
  triggerConfig: Prisma.JsonValue;
}
