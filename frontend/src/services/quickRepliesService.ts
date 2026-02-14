import { api } from "@/lib/axios";
import { QuickReply, CreateQuickReplyDTO, UpdateQuickReplyDTO } from "@/types";

export const quickRepliesService = {
  /**
   * Fetch all quick replies for the user/tenant
   */
  getQuickReplies: async (): Promise<QuickReply[]> => {
    const res = await api.get("/quick-replies");
    // Robust handling: backend might return { data: { replies: [...] } } or just array
    const data = res.data.data?.replies || res.data.data || res.data;
    return Array.isArray(data) ? data : [];
  },

  /**
   * Create a new quick reply
   */
  createQuickReply: async (data: CreateQuickReplyDTO): Promise<QuickReply> => {
    const res = await api.post("/quick-replies", data);
    return res.data.data?.reply || res.data.data || res.data;
  },

  /**
   * Update an existing quick reply
   */
  updateQuickReply: async (
    id: string,
    data: UpdateQuickReplyDTO,
  ): Promise<QuickReply> => {
    const res = await api.patch(`/quick-replies/${id}`, data);
    return res.data.data?.reply || res.data.data || res.data;
  },

  /**
   * Delete a quick reply
   */
  deleteQuickReply: async (id: string): Promise<boolean> => {
    await api.delete(`/quick-replies/${id}`);
    return true;
  },
};

