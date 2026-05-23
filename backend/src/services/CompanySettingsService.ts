import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { companyRepository } from "@/repositories/CompanyRepository";
import { SystemEmailService } from "@/services/EmailService";

/**
 *  COMPANY SETTINGS SERVICE
 *
 * Data access layer for company/tenant settings.
 * Handles read and update of general, SMTP, business hours, and automation settings.
 */

export const companySettingsService = {
  async getSettings(companyId: string) {
    const company = await companyRepository.findUnique({
      where: { id: companyId },
      select: {
        name: true,
        slug: true,
        logoUrl: true,
        address: true,
        phone: true,
        website: true,
        timezone: true,
        settings: true,
        emailProvider: true,
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        smtpPassword: true,
        smtpSecure: true,
        defaultSenderEmail: true,
        defaultSenderName: true,
        plan: {
          select: {
            id: true,
            name: true,
            price: true,
            config: true,
          },
        },
        subscriptionEndsAt: true,
      },
    });

    if (!company) {
      throw new AppError("Compañía no encontrada", 404);
    }

    // [SEC] Never expose raw SMTP password to frontend — mask it
    return {
      ...company,
      smtpPassword: company.smtpPassword ? "********" : null,
    };
  },

  async updateSettings(
    companyId: string,
    data: {
      general?: Record<string, unknown>;
      businessHours?: Record<string, unknown>;
      automation?: Record<string, unknown>;
      smtp?: Record<string, unknown>;
      dataRequest?: Record<string, unknown>;
    },
  ) {
    const updateData: Record<string, unknown> = {};

    // 1. General fields
    if (data.general) {
      const g = data.general;
      if (g.name) updateData.name = g.name;
      if (g.logo) updateData.logoUrl = g.logo;
      if (g.address) updateData.address = g.address;
      if (g.phone) updateData.phone = g.phone;
      if (g.website) updateData.website = g.website;
      if (g.timezone) updateData.timezone = g.timezone;
    }

    // 2. SMTP fields
    if (data.smtp) {
      const s = data.smtp;
      if (s.host !== undefined) updateData.smtpHost = s.host;
      if (s.port !== undefined) updateData.smtpPort = parseInt(String(s.port));
      if (s.user !== undefined) updateData.smtpUser = s.user;
      if (s.password && s.password !== "********") {
        // [SEC] ENCRYPT SMTP password before persisting (AES-256-GCM, tenant-scoped)
        updateData.smtpPassword = SystemEmailService.encryptSmtpPassword(
          String(s.password),
          companyId,
        );
        Logger.info(`[CompanySettings] SMTP password encrypted for company ${companyId}`);
      }
      if (s.secure !== undefined) updateData.smtpSecure = s.secure;
      if (s.senderEmail !== undefined)
        updateData.defaultSenderEmail = s.senderEmail;
      if (s.senderName !== undefined)
        updateData.defaultSenderName = s.senderName;
      if (s.provider !== undefined) updateData.emailProvider = s.provider;
    }

    // 3. JSON settings (merge)
    if (data.businessHours || data.automation || data.dataRequest) {
      const currentCompany = await companyRepository.findUnique({
        where: { id: companyId },
        select: { settings: true },
      });

      const currentSettings =
        (currentCompany?.settings as Record<string, unknown>) || {};

      updateData.settings = {
        ...currentSettings,
        ...(data.businessHours ? { businessHours: data.businessHours } : {}),
        ...(data.automation ? { automation: data.automation } : {}),
        ...(data.dataRequest ? { dataRequest: data.dataRequest } : {}),
      };
    }

    const updated = await companyRepository.update(companyId, updateData);

    Logger.info(`[Company] Settings updated for ${companyId}`);
    return updated;
  },

  /**
   * Get company sender email config (used by emailController)
   */
  async getSenderConfig(companyId: string) {
    const company = await companyRepository.findUnique({
      where: { id: companyId },
      select: {
        defaultSenderEmail: true,
        defaultSenderName: true,
        smtpUser: true,
      },
    });

    if (!company) {
      throw new AppError("Company not found", 404);
    }

    const fromEmail =
      company.defaultSenderEmail ||
      company.smtpUser ||
      process.env.DEFAULT_SENDER_EMAIL ||
      `no-reply@${company.slug || "system"}.sentry.software`;

    const fromName =
      company.defaultSenderName ||
      company.smtpUser?.split("@")[0] ||
      company.name ||
      "Sentry Software";

    return { fromEmail, fromName };
  },

  /**
   * Get email config status (used by companyEmailConfigController)
   */
  async getEmailConfigStatus(companyId: string) {
    const company = await companyRepository.findUnique({
      where: { id: companyId },
      select: {
        defaultSenderEmail: true,
        defaultSenderName: true,
        smtpHost: true,
        smtpUser: true,
        emailProvider: true,
      },
    });

    if (!company) {
      throw new AppError("Company not found", 404);
    }

    const isConfigured = !!(
      company.defaultSenderEmail ||
      (company.smtpHost && company.smtpUser)
    );

    return {
      isConfigured,
      senderEmail: company.defaultSenderEmail || company.smtpUser || null,
      senderName:
        company.defaultSenderName || company.smtpUser?.split("@")[0] || null,
      provider: company.emailProvider,
    };
  },
};
