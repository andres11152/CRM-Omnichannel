import { api } from "@/lib/axios";

export interface FeatureFlags {
  advanced_ai: boolean;
  email_module: boolean;
  bulk_marketing: boolean;
  api_access: boolean;
  group_sync: boolean;
  kanban_deals: boolean;
  voice_messages: boolean;
  automation_flows: boolean;
  team_collaboration: boolean;
}

export const featureFlagService = {
  async getCompanyFlags(companyId: string): Promise<FeatureFlags> {
    const res = await api.get<FeatureFlags>(`/admin/companies/${companyId}/feature-flags`);
    return res.data;
  },

  async updateCompanyFlags(companyId: string, flags: Partial<FeatureFlags>): Promise<FeatureFlags> {
    const res = await api.patch<FeatureFlags>(`/admin/companies/${companyId}/feature-flags`, { flags });
    return res.data;
  }
};
