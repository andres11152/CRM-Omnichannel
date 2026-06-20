import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { companyRepository } from "@/repositories/CompanyRepository";
import { SystemEmailService } from "@/services/EmailService";
import { userRepository } from "@/repositories/UserRepository";
import { contactService } from "@/services/ContactService";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";

/**
 *  COMPANY SETTINGS SERVICE
 *
 * Data access layer for company/tenant settings.
 * Handles read and update of general, SMTP, business hours, and automation settings.
 */

// [WA-CONTACTS] Small cache for the auto-import flag. upsertWhatsAppUser runs on every
// inbound/synced message, so we must NOT hit the DB each time. 60s TTL is plenty.
const autoImportCache = new Map<string, { value: boolean; expires: number }>();
const AUTO_IMPORT_TTL_MS = 60_000;

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
      whatsappSync?: Record<string, unknown>;
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
    if (data.businessHours || data.automation || data.dataRequest || data.whatsappSync) {
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
        ...(data.whatsappSync ? { whatsappSync: data.whatsappSync } : {}),
      };

      // Invalidate the cached auto-import flag so the change takes effect immediately.
      if (data.whatsappSync) autoImportCache.delete(companyId);
    }

    const updated = await companyRepository.update(companyId, updateData);

    Logger.info(`[Company] Settings updated for ${companyId}`);
    return updated;
  },

  /**
   * [WA-CONTACTS] Whether to auto-create CRM Contacts from WhatsApp chats/sync.
   * Default FALSE — contacts are NOT created automatically; the user enables it
   * explicitly (toggle) or imports manually. Cached to avoid per-message DB reads.
   */
  async isAutoImportContactsEnabled(companyId: string): Promise<boolean> {
    const cached = autoImportCache.get(companyId);
    if (cached && cached.expires > Date.now()) return cached.value;

    let value = false;
    try {
      const company = await companyRepository.findUnique({
        where: { id: companyId },
        select: { settings: true },
      });
      const settings = (company?.settings as Record<string, unknown>) || {};
      const wa = (settings.whatsappSync as Record<string, unknown>) || {};
      value = wa.autoImportContacts === true; // strict: default false
    } catch (err) {
      Logger.warn(`[CompanySettings] Failed to read auto-import flag for ${companyId}, defaulting OFF`, { err });
      value = false;
    }

    autoImportCache.set(companyId, { value, expires: Date.now() + AUTO_IMPORT_TTL_MS });
    return value;
  },

  /**
   * [WA-CONTACTS] Manual, on-demand import: scans existing WhatsApp "shadow" users
   * (created from chats) and creates CRM Contacts ONLY for valid real phone numbers,
   * skipping LIDs / internal IDs. Returns counts for UI feedback.
   */
  async importWhatsAppContacts(companyId: string): Promise<{ imported: number; skipped: number; total: number }> {
    const users = await userRepository.findMany({
      where: {
        companyId,
        role: "USER",
        email: { endsWith: "@whatsapp.user" },
        phone: { not: null },
      },
      select: { id: true, name: true, phone: true, email: true },
    });

    let imported = 0;
    let skipped = 0;

    for (const u of users) {
      if (!u.phone || !WhatsAppIdUtils.isValidCrmPhone(u.phone)) {
        skipped++;
        continue;
      }
      try {
        await contactService.upsert(companyId, {
          phone: u.phone,
          name: u.name,
          email: null,
          customFields: {
            source: "whatsapp",
            whatsappId: u.email.split("@")[0],
            userId: u.id,
          },
          tags: ["Imported from Chat"],
        });
        imported++;
      } catch (err) {
        Logger.warn(`[CompanySettings] Manual import: failed to upsert contact for ${u.phone}`, { err });
        skipped++;
      }
    }

    Logger.info(`[CompanySettings] Manual WhatsApp contact import for ${companyId}: ${imported} imported, ${skipped} skipped (of ${users.length})`);
    return { imported, skipped, total: users.length };
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
