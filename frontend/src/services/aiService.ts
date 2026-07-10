import { api } from "@/lib/axios";
import type { ApiError } from "@/lib/axios";

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
  try {
    const res = await api.get("/ai/config");
    return res.data;
  } catch (error) {
    if ((error as ApiError).status === 403) {
      return { openaiKey: "", geminiKey: "" };
    }
    throw error;
  }
};

export const updateAIConfig = async (data: {
  openaiKey?: string;
  geminiKey?: string;
}) => {
  const res = await api.put("/ai/config", data);
  return res.data;
};

export const getAssistants = async () => {
  try {
    const res = await api.get("/ai/assistants");
    return res.data;
  } catch (error) {
    if ((error as ApiError).status === 403) {
      return [];
    }
    throw error;
  }
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
