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

export interface WorkflowConditionRule {
  operator: string;
  value: string;
  targetHandle: string;
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
  // Condition node (shared with the chatbot FlowBuilder canvas)
  conditions?: WorkflowConditionRule[];
  conditionOperator?: string;
  conditionValue?: string;
  conditionVariable?: string;
  // Tag Contact node
  tags?: string;
  tag?: string;
  action?: string;
  // HTTP Request node
  webhookUrl?: string;
  url?: string;
  httpMethod?: string;
  method?: string;
  headers?: string;
  authHeader?: string;
  bodyTemplate?: string;
  body?: string;
  variable?: string;
  errorNodeId?: string;
  // Delay node
  delayValue?: string | number;
  delayUnit?: string;
  // Assign Agent node (CRM context: reassign deal owner)
  agentId?: string;
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
  // The FlowBuilder canvas (index.tsx handleNodeConnectEnd) stamps the
  // originating port's label here (e.g. "TRUE"/"FALSE") — it never sets
  // sourceHandle. sourceHandle is kept for the conditions[] multi-branch
  // shape, which isn't wired to any UI yet but is used by templates.
  label?: string;
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

export interface WorkflowActionResult {
  // Set by branching nodes (e.g. "condition") to tell the graph walker to
  // only follow outward edges whose sourceHandle matches this value,
  // instead of the default fan-out to every outward edge.
  branch?: string;
}

export interface WorkflowActionHandler {
  execute(
    node: WorkflowNode,
    payload: DealPayload,
    companyId: string,
    systemUserId: string,
  ): Promise<WorkflowActionResult | void>;
}
