import { Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/prisma";
import { AuthenticatedRequest } from "@/types/types";

export const getTemplates = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return res
        .status(200)
        .json({ status: "success", results: 0, data: { templates: [] } });
    }

    try {
      console.log("Fetching templates for company:", companyId);
      const templates = await prisma.$queryRaw`
            SELECT * FROM message_templates 
            WHERE "companyId" = ${companyId} 
            ORDER BY "createdAt" DESC
        `;

      res.status(200).json({
        status: "success",
        results: (templates as any[]).length,
        data: { templates },
      });
    } catch (error) {
      console.error("Error fetching templates:", error);
      return next(new AppError("Failed to fetch templates", 500));
    }
  }
);

export const createTemplate = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { name, category, components, language } = req.body;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    const id = randomUUID();
    const now = new Date();
    // Safely stringify components to avoid object serialization issues in raw query
    const componentsJson = JSON.stringify(components || []);

    try {
      await prisma.$executeRaw`
            INSERT INTO message_templates (id, "companyId", name, category, components, language, status, "createdAt", "updatedAt")
            VALUES (${id}, ${companyId}, ${name}, ${
        category || "MARKETING"
      }, ${componentsJson}::jsonb, ${
        language || "es"
      }, 'approved', ${now}, ${now})
        `;

      const result =
        await prisma.$queryRaw`SELECT * FROM message_templates WHERE id = ${id}`;
      const template = (result as any[])[0];

      res.status(201).json({
        status: "success",
        data: { template },
      });
    } catch (error) {
      console.error("Error creating template:", error);
      return next(new AppError("Failed to create template", 500));
    }
  }
);

export const deleteTemplate = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    try {
      await prisma.$executeRaw`DELETE FROM message_templates WHERE id = ${id} AND "companyId" = ${companyId}`;
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting template:", error);
      return next(new AppError("Failed to delete template", 500));
    }
  }
);
