import { Response } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { catchAsync } from "@/utils/catchAsync";
import { prisma } from "@/config/database";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";

export const getCompanySettings = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId;

    if (!companyId) {
      throw new AppError("Usuario no tiene compañía asignada", 400);
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      // getCompanySettings modifications
      select: {
        name: true,
        slug: true,
        logoUrl: true,
        address: true,
        phone: true,
        website: true,
        timezone: true,
        settings: true,
        // SMTP Fields
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

    // Parse JSON settings or default
    const jsonSettings: any = company.settings || {};

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
        // Security: Never return real password to frontend
        hasPassword: !!company.smtpPassword,
        secure: company.smtpSecure ?? true,
        senderEmail: company.defaultSenderEmail || "",
        senderName: company.defaultSenderName || "",
      },
      businessHours: jsonSettings.businessHours || {
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
      automation: jsonSettings.automation || {
        welcomeMessage:
          "¡Hola! Gracias por escribirnos. Un agente te atenderá pronto.",
        welcomeEnabled: true,
        oooMessage:
          "Actualmente estamos fuera de nuestro horario laboral. Te responderemos pronto.",
        oooEnabled: true,
      },
      billing: {
        plan: company.plan,
        subscriptionEndsAt: company.subscriptionEndsAt,
      },
    };

    res.json(responseData);
  }
);

export const updateCompanySettings = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const { general, businessHours, automation, smtp } = req.body;

    if (!companyId) {
      throw new AppError("Usuario no tiene compañía asignada", 400);
    }

    // 1. Update Core Fields if 'general' is provided
    let updateData: any = {};
    if (general) {
      if (general.name) updateData.name = general.name;
      if (general.logo) updateData.logoUrl = general.logo;
      if (general.address) updateData.address = general.address;
      if (general.phone) updateData.phone = general.phone;
      if (general.website) updateData.website = general.website;
      if (general.timezone) updateData.timezone = general.timezone;
    }

    // 2. Update SMTP Settings
    if (smtp) {
      if (smtp.host !== undefined) updateData.smtpHost = smtp.host;
      if (smtp.port !== undefined) updateData.smtpPort = parseInt(smtp.port);
      if (smtp.user !== undefined) updateData.smtpUser = smtp.user;
      // Only update password if provided and not empty/masked
      if (smtp.password && smtp.password !== "********") {
        updateData.smtpPassword = smtp.password; // TODO: Encrypt here
      }
      if (smtp.secure !== undefined) updateData.smtpSecure = smtp.secure;
      if (smtp.senderEmail !== undefined)
        updateData.defaultSenderEmail = smtp.senderEmail;
      if (smtp.senderName !== undefined)
        updateData.defaultSenderName = smtp.senderName;
      if (smtp.provider !== undefined) updateData.emailProvider = smtp.provider;
    }

    // 3. Update JSON Settings (Merge with existing)
    if (businessHours || automation) {
      // Fetch current settings first to merge deeply if needed,
      // but for now we expect the frontend to send the full block for each section
      const currentCompany = await prisma.company.findUnique({
        where: { id: companyId },
        select: { settings: true },
      });

      const currentSettings: any = currentCompany?.settings || {};

      const newSettings = {
        ...currentSettings,
        ...(businessHours ? { businessHours } : {}),
        ...(automation ? { automation } : {}),
      };

      updateData.settings = newSettings;
    }

    const updatedCompany = await prisma.company.update({
      where: { id: companyId },
      data: updateData,
    });

    Logger.info(
      `[Company] Settings updated for ${companyId} by ${req.user?.email}`
    );

    res.json({ status: "success", data: updatedCompany });
  }
);
