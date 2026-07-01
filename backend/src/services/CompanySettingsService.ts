import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { companyRepository } from "@/repositories/CompanyRepository";
import { SystemEmailService } from "@/services/EmailService";
import { userRepository } from "@/repositories/UserRepository";
import { contactService } from "@/services/ContactService";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";
import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import redisClient from "@/config/redis";

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
   * [WA-CONTACTS] Manual, on-demand import: scans the active WhatsApp session's
   * memory store (persisted in Redis) and creates CRM Contacts ONLY for valid real phone numbers.
   * If there are multiple active sessions, requires specifying a sessionId.
   */
  async importWhatsAppContacts(
    companyId: string,
    sessionId?: string,
  ): Promise<{ imported: number; skipped: number; total: number }> {
    // 1. Fetch active sessions (status = CONNECTED)
    const activeSessions = await whatsappSessionRepository.findMany(companyId, {
      where: { status: "CONNECTED" },
      select: { sessionId: true, phone: true },
    });

    if (activeSessions.length === 0) {
      throw new AppError("No se encontró ninguna sesión activa de WhatsApp. Conecta un dispositivo primero.", 400);
    }

    let targetSessionId = sessionId;

    if (targetSessionId) {
      // Validate requested sessionId is active
      const exists = activeSessions.some((s) => s.sessionId === targetSessionId);
      if (!exists) {
        throw new AppError("La sesión de WhatsApp seleccionada no está activa o no existe.", 400);
      }
    } else {
      // Auto-choose if exactly one active session
      if (activeSessions.length === 1) {
        targetSessionId = activeSessions[0].sessionId;
      } else {
        // Multiple sessions: user must specify
        throw new AppError(
          "Se encontraron múltiples sesiones de WhatsApp activas. Por favor especifica de cuál deseas importar los contactos.",
          400,
        );
      }
    }

    // 2. Fetch contacts from Redis SimpleStore cache
    const redisKey = `wa:store:${companyId}_${targetSessionId}`;
    let contactsData: Record<string, { id: string; name?: string | null }> = {};

    if (redisClient?.isOpen) {
      try {
        const dataStr = await redisClient.get(redisKey);
        if (dataStr) {
          const data = JSON.parse(dataStr);
          contactsData = data.contacts || {};
        }
      } catch (e) {
        Logger.error(`[CompanySettingsService] Failed to read/parse Redis store for ${redisKey}`, e);
      }
    }

    const contactList = Object.values(contactsData);

    if (contactList.length === 0) {
      throw new AppError(
        "No se encontraron contactos sincronizados en la sesión de WhatsApp seleccionada. Por favor espera a que se complete la sincronización inicial.",
        400,
      );
    }

    let imported = 0;
    let skipped = 0;

    for (const c of contactList) {
      const jid = c.id;
      if (!jid || jid.endsWith("@g.us")) {
        skipped++;
        continue;
      }

      // Extract phone number from JID (e.g. 573123456789@s.whatsapp.net -> 573123456789)
      const phone = jid.split("@")[0].split(":")[0];
      if (!WhatsAppIdUtils.isValidCrmPhone(phone)) {
        skipped++;
        continue;
      }

      try {
        await contactService.upsert(companyId, {
          phone,
          name: c.name || `WhatsApp Contact ${phone}`,
          email: null,
          customFields: {
            source: "whatsapp",
            whatsappId: jid,
            sessionId: targetSessionId,
          },
          tags: ["Imported from WhatsApp"],
        });
        imported++;
      } catch (err) {
        Logger.warn(`[CompanySettings] Manual import: failed to upsert contact for ${phone}`, { err });
        skipped++;
      }
    }

    Logger.info(
      `[CompanySettings] Manual WhatsApp contact import for ${companyId} (session: ${targetSessionId}): ${imported} imported, ${skipped} skipped (of ${contactList.length})`,
    );
    return { imported, skipped, total: contactList.length };
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

  /**
   * [ADMIN-ONLY] Nuclear cleanup: deletes all contacts across all tenants.
   * Leverages runAsSystem to bypass automatic RLS company isolation.
   */
  async nuclearDeleteAllContacts(): Promise<number> {
    const { runAsSystem } = await import("@/context/requestContext");
    const { contactRepository } = await import("@/repositories/ContactRepository");
    return runAsSystem(async () => {
      return contactRepository.nuclearDeleteAll();
    });
  },
};
