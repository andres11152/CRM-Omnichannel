import { api } from "./apiClient";

export interface SuggestedField {
  id: string;
  label: string;
  icon?: React.ElementType;
  iconName?: string;
  color?: string;
}

export interface CompanySettings {
  general: {
    name: string;
    logo: string;
    slug: string;
    address: string;
    phone: string;
    website: string;
    timezone: string;
  };
  dataRequest?: {
    suggestedFields: SuggestedField[];
  };
}

export const companyService = {
  async getSettings(): Promise<CompanySettings> {
    const response = await api.get<CompanySettings>("/company/settings");
    return response;
  },

  async updateSettings(data: Partial<CompanySettings>): Promise<void> {
    await api.patch("/company/settings", data);
  }
};
