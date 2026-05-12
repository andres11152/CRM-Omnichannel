import { api } from "@/lib/axios";

export interface GlobalInventory {
  templates: Array<{
    id: string;
    name: string;
    channel: string;
    category: string;
    language: string;
    company: { name: string };
  }>;
  workflows: Array<{
    id: string;
    name: string;
    description?: string;
    triggerType: string;
  }>;
}

export const marketplaceService = {
  async getInventory(): Promise<GlobalInventory> {
    const res = await api.get<GlobalInventory>("/admin/marketplace/inventory");
    return res.data;
  },

  async toggleTemplate(templateId: string, isGlobal: boolean) {
    const res = await api.patch(`/admin/marketplace/templates/${templateId}`, { isGlobal });
    return res.data;
  },

  async toggleWorkflow(workflowId: string, isGlobal: boolean) {
    const res = await api.patch(`/admin/marketplace/workflows/${workflowId}`, { isGlobal });
    return res.data;
  },

  async manualDistribute(companyId: string) {
    const res = await api.post(`/admin/marketplace/distribute/${companyId}`);
    return res.data;
  }
};
