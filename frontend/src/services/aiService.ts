import { api } from "@/lib/axios";

/** AI Assistant Input DTO (replaces `any`) */
export interface AssistantInput {
  name: string;
  modelName?: string;
  systemPrompt?: string;
  temperature?: number;
  isActive?: boolean;
  knowledgeBaseIds?: string[];
  queueId?: string;
}

export const getAIConfig = async () => {
  const res = await api.get("/ai/config");
  return res.data;
};

export const updateAIConfig = async (data: {
  openaiKey?: string;
  geminiKey?: string;
}) => {
  const res = await api.put("/ai/config", data);
  return res.data;
};

export const getAssistants = async () => {
  const res = await api.get("/ai/assistants");
  return res.data;
};

export const createAssistant = async (data: AssistantInput) => {
  const res = await api.post("/ai/assistants", data);
  return res.data;
};

export const updateAssistant = async (
  id: string,
  data: Partial<AssistantInput>,
) => {
  const res = await api.put(`/ai/assistants/${id}`, data);
  return res.data;
};

export const deleteAssistant = async (id: string) => {
  await api.delete(`/ai/assistants/${id}`);
};
