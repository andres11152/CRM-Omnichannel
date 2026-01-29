import { Agent, QueueConfig } from "../types";
import { api } from "../src/lib/axios";

// Strict DTOs for 100-year maintainability
export interface CreateQueueDTO {
  name: string;
  departmentId: string;
  type: "MANUAL" | "ROUND_ROBIN" | "AI";
  aiAssistantId?: string | null;
  promptTemplateId?: string;
}

export interface UpdateQueueDTO extends Partial<CreateQueueDTO> {
  isActive?: boolean;
}

/**
 * Fetch all available agents (for assignment logic)
 */
export const getAgents = async (): Promise<Agent[]> => {
  const res = await api.get("/users?role=AGENT");
  return res.data.data?.users || [];
};

/**
 * Fetch all queues
 */
export const getQueues = async (): Promise<QueueConfig[]> => {
  const res = await api.get("/queues");
  // Ensure we return a clean array
  return Array.isArray(res.data) ? res.data : [];
};

/**
 * Create a new queue
 */
export const createQueue = async (
  data: CreateQueueDTO,
): Promise<QueueConfig> => {
  const res = await api.post("/queues", data);
  return res.data;
};

/**
 * Update an existing queue
 */
export const updateQueue = async (
  id: string,
  data: UpdateQueueDTO,
): Promise<QueueConfig> => {
  const res = await api.patch(`/queues/${id}`, data);
  return res.data;
};

/**
 * Delete a queue
 */
export const deleteQueue = async (id: string): Promise<void> => {
  await api.delete(`/queues/${id}`);
};

/**
 * Assign queues to an agent
 */
export const updateAgentQueues = async (
  agentId: string,
  queueIds: string[],
): Promise<Agent> => {
  const res = await api.patch(`/users/${agentId}`, { queueIds });
  return res.data.data.user;
};
