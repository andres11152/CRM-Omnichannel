import { api } from "./apiClient";

export interface SuggestedField {
  id: string;
  label: string;
  icon?: React.ElementType;
  iconName?: string;
  color?: string;
}

export interface DaySchedule {
  open: string;
  close: string;
  active: boolean;
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
  businessHours?: {
    enabled: boolean;
    schedule: Record<string, DaySchedule>;
  };
  automation?: {
    welcomeMessage: string;
    welcomeEnabled: boolean;
    oooMessage: string;
    oooEnabled: boolean;
  };
  smtp?: {
    provider: string;
    host: string;
    port: number;
    user: string;
    hasPassword?: boolean;
    secure: boolean;
    senderEmail: string;
    senderName: string;
  };
  billing?: {
    plan: { id?: string; name?: string; price?: number } | null;
    subscriptionEndsAt: string | null;
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
