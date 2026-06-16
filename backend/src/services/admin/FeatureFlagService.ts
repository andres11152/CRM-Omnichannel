import { companyRepository } from "@/repositories/CompanyRepository";
import { Logger } from "@/utils/logger";
import { AppError } from "@/utils/AppError";

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
export interface CompanySettings {
  featureFlags?: FeatureFlags;
  [key: string]: unknown;
}

const DEFAULT_FLAGS: FeatureFlags = {
  advanced_ai: false,
  email_module: false,
  bulk_marketing: false,
  api_access: false,
  group_sync: false,
  kanban_deals: true,
  voice_messages: true,
  automation_flows: true,
  team_collaboration: true,
};

export class FeatureFlagService {
  /**
   * Get all flags for a specific company
   */
  async getCompanyFlags(companyId: string): Promise<FeatureFlags> {
    const company = await companyRepository.findUnique({
      where: { id: companyId },
      select: { settings: true }
    });

    if (!company) throw new AppError("Empresa no encontrada", 404);

    const settings = (company.settings as unknown as CompanySettings) || {};
    return {
      ...DEFAULT_FLAGS,
      ...(settings.featureFlags || {})
    };
  }

  /**
   * Update specific flags for a company
   */
  async updateCompanyFlags(companyId: string, flags: Partial<FeatureFlags>): Promise<FeatureFlags> {
    const company = await companyRepository.findUnique({
      where: { id: companyId },
      select: { settings: true }
    });

    if (!company) throw new AppError("Empresa no encontrada", 404);

    const currentSettings = (company.settings as unknown as CompanySettings) || {};
    const currentFlags = currentSettings.featureFlags || DEFAULT_FLAGS;

    const updatedFlags = {
      ...currentFlags,
      ...flags
    };

    await companyRepository.update(companyId, {
      settings: {
        ...currentSettings,
        featureFlags: updatedFlags
      }
    });

    Logger.info(`[FeatureFlagService] Flags updated for company ${companyId}`, flags);
    return updatedFlags;
  }

  /**
   * Utility to check if a feature is enabled (to be used by other services)
   */
  async isFeatureEnabled(companyId: string, featureKey: keyof FeatureFlags): Promise<boolean> {
    const flags = await this.getCompanyFlags(companyId);
    return !!flags[featureKey];
  }
}

export const featureFlagService = new FeatureFlagService();
