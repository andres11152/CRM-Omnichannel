import { Campaign } from "@/types";
import { api } from "@/lib/axios";

export const marketingService = {
  /**
   * Create a real marketing campaign
   */
  createCampaign: async (data: Partial<Campaign>): Promise<Campaign> => {
    const res = await api.post("/campaigns", data);
    return res.data.data.campaign;
  },

  /**
   * Get all marketing campaigns
   */
  getCampaigns: async (): Promise<Campaign[]> => {
    const res = await api.get("/campaigns");
    return res.data.data?.campaigns || [];
  },

  deleteCampaign: async (id: string): Promise<void> => {
    await api.delete(`/campaigns/${id}`);
  },

  updateCampaign: async (
    id: string,
    data: Partial<Campaign>
  ): Promise<Campaign> => {
    const res = await api.patch(`/campaigns/${id}`, data);
    return res.data.data.campaign;
  },

  /**
   * Create a post (Legacy/Forum)
   */
  createPost: async (content: string): Promise<any> => {
    const res = await api.post("/posts", { content });
    return res.data;
  },

  /**
   * Get all posts (Legacy/Forum)
   */
  getPosts: async (): Promise<any[]> => {
    const res = await api.get("/posts");
    return res.data.data?.posts || [];
  },

  /**
   * Create a reply to a post
   */
  createReply: async (postId: string, content: string): Promise<any> => {
    const res = await api.post("/replies", { postId, content });
    return res.data;
  },

  /**
   * Get replies for a post
   */
  getReplies: async (postId: string): Promise<any[]> => {
    const res = await api.get(`/replies/post/${postId}`);
    return res.data.data?.replies || [];
  },

  generateAITemplate: async (text: string): Promise<string> => {
    const res = await api.post("/ai/copilot", {
      action: "generate_template",
      text,
    });
    return res.data.response; // Adapt based on backend response structure
  },
};

