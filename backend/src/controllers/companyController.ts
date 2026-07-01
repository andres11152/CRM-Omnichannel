import { Response } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { companySettingsService } from "@/services/CompanySettingsService";

/**
 *  COMPANY CONTROLLER
 *
 * HTTP orchestrator for company/tenant settings.
 * All data access delegated to companySettingsService (SRP).
 */

export const getCompanySettings = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId;

    if (!companyId) {
      throw new AppError("Usuario no tiene compañía asignada", 400);
    }

    const company = (await companySettingsService.getSettings(
      companyId,
    )) as Awaited<ReturnType<typeof companySettingsService.getSettings>> & {
      plan?: { id: string; name: string; price: number; config: unknown };
    };

    const jsonSettings = (company.settings as Record<string, unknown>) || {};

    const responseData = {
      general: {
        name: company.name,
        logo:
          company.logoUrl ||
          "https://ui-avatars.com/api/?name=" +
            encodeURIComponent(company.name) +
            "&background=random",
        slug: company.slug || "",
        address: company.address || "",
        phone: company.phone || "",
        website: company.website || "",
        timezone: company.timezone || "America/Bogota",
      },
      smtp: {
        provider: company.emailProvider || "SMTP",
        host: company.smtpHost || "",
        port: company.smtpPort || 587,
        user: company.smtpUser || "",
        hasPassword: !!company.smtpPassword,
        secure: company.smtpSecure || true,
        senderEmail: company.defaultSenderEmail || "",
        senderName: company.defaultSenderName || "",
      },
      businessHours: (jsonSettings.businessHours as Record<
        string,
        unknown
      >) || {
        enabled: true,
        schedule: {
          mon: { open: "08:00", close: "18:00", active: true },
          tue: { open: "08:00", close: "18:00", active: true },
          wed: { open: "08:00", close: "18:00", active: true },
          thu: { open: "08:00", close: "18:00", active: true },
          fri: { open: "08:00", close: "18:00", active: true },
          sat: { open: "09:00", close: "12:00", active: true },
          sun: { open: "00:00", close: "00:00", active: false },
        },
      },
      automation: (jsonSettings.automation as Record<string, unknown>) || {
        welcomeMessage:
          "¡Hola! Gracias por escribirnos. Un agente te atenderá pronto.",
        welcomeEnabled: true,
        oooMessage:
          "Actualmente estamos fuera de nuestro horario laboral. Te responderemos pronto.",
        oooEnabled: true,
      },
      dataRequest: (jsonSettings.dataRequest as Record<string, unknown>) || {
        suggestedFields: [],
      },
      whatsappSync: (jsonSettings.whatsappSync as Record<string, unknown>) || {
        // Default OFF: contacts are NOT auto-created from WhatsApp chats.
        autoImportContacts: false,
      },
      billing: {
        plan: company.plan,
        subscriptionEndsAt: company.subscriptionEndsAt,
      },
    };

    res.json(responseData);
  },
);

export const updateCompanySettings = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const { general, businessHours, automation, smtp, dataRequest, whatsappSync } = req.body;

    if (!companyId) {
      throw new AppError("Usuario no tiene compañía asignada", 400);
    }

    const updatedCompany = await companySettingsService.updateSettings(
      companyId,
      { general, businessHours, automation, smtp, dataRequest, whatsappSync },
    );

    Logger.info(
      `[Company] Settings updated for ${companyId} by ${req.user?.email}`,
    );

    res.json({ status: "success", data: updatedCompany });
  },
);

/**
 * [WA-CONTACTS] Manual, on-demand import of WhatsApp contacts into the CRM.
 * Imports ONLY valid real phone numbers (skips LIDs / internal IDs).
 */
export const importWhatsAppContacts = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId;

    if (!companyId) {
      throw new AppError("Usuario no tiene compañía asignada", 400);
    }

    const sessionId = (req.body?.sessionId || req.query?.sessionId) as string | undefined;

    const result = await companySettingsService.importWhatsAppContacts(companyId, sessionId);

    Logger.info(
      `[Company] Manual WhatsApp contact import by ${req.user?.email}: ${result.imported} imported, ${result.skipped} skipped`,
    );

    res.json({ status: "success", data: result });
  },
);

/**
 * [ADMIN-ONLY] Nuclear cleanup: DELETE all contacts across all tenants.
 * Use ONLY in dev/staging, NEVER in production.
 */
export const deleteAllContactsNuclear = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;

    // [SEC] Only MASTER can nuke
    if (user?.role !== "MASTER") {
      throw new AppError("Solo MASTER puede ejecutar limpiezas nucleares", 403);
    }

    const deletedCount = await companySettingsService.nuclearDeleteAllContacts();

    Logger.warn(
      `[NUCLEAR] All contacts deleted by ${user.email}: ${deletedCount} records removed`,
    );

    res.json({
      status: "success",
      data: {
        deleted: deletedCount,
        message: "Todos los contactos de todos los tenants han sido eliminados",
      },
    });
  },
);
