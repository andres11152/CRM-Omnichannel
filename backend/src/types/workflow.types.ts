export interface DealPayload {
  dealId: string;
  companyId: string;
  previousStage?: string;
  newStage?: string;
  variables?: Record<string, string | number | boolean | null | undefined>;
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
    aiAssistantId?: string;
    assistantId?: string;
    [key: string]: unknown;
  };
  aiAssistantId?: string;
  content?: string;
  label?: string;
}

export interface WorkflowNode {
  id: string;
  type: string;
  data?: WorkflowNodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  isActive: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  companyId: string;
  triggerConfig: WorkflowTriggerConfig;
}

export interface WorkflowActionHandler {
  execute(
    node: WorkflowNode,
    payload: DealPayload,
    companyId: string,
    systemUserId: string,
  ): Promise<void>;
}
