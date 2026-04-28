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
    const { general, businessHours, automation, smtp, dataRequest } = req.body;

    if (!companyId) {
      throw new AppError("Usuario no tiene compañía asignada", 400);
    }

    const updatedCompany = await companySettingsService.updateSettings(
      companyId,
      { general, businessHours, automation, smtp, dataRequest },
    );

    Logger.info(
      `[Company] Settings updated for ${companyId} by ${req.user?.email}`,
    );

    res.json({ status: "success", data: updatedCompany });
  },
);
