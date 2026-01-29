import { Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/database";
import { AuthenticatedRequest } from "@/types/types";
// ♻️ REFACTOR: Unified Service
import { whatsappService } from "@/whatsapp";
import { Logger } from "@/utils/logger";

/**
 * 📝 TEMPLATE CONTROLLER
 *
 * Handles CRUD operations for WhatsApp message templates
 * and template testing/sending functionality
 */

/**
 * GET /templates
 * List all templates for company
 */
export const getTemplates = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return res
        .status(200)
        .json({ status: "success", results: 0, data: { templates: [] } });
    }

    const { category, channel, status, search, limit, offset } =
      req.query as any;

    // Build where clause
    const where: any = { companyId };

    if (category) where.category = category;
    if (channel) where.channel = channel;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { subject: { contains: search, mode: "insensitive" } },
      ];
    }

    const templates = await prisma.messageTemplate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit ? parseInt(limit) : 50,
      skip: offset ? parseInt(offset) : 0,
    });

    res.status(200).json({
      status: "success",
      results: templates.length,
      data: { templates },
    });
  },
);

/**
 * GET /templates/:id
 * Get single template by ID
 */
export const getTemplate = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    const template = await prisma.messageTemplate.findFirst({
      where: { id, companyId },
    });

    if (!template) {
      return next(new AppError("Template not found", 404));
    }

    res.status(200).json({
      status: "success",
      data: { template },
    });
  },
);

/**
 * POST /templates
 * Create new template
 */
export const createTemplate = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { name, category, components, language, channel, subject, status } =
      req.body;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    // Check for duplicate template name
    const existing = await prisma.messageTemplate.findFirst({
      where: {
        companyId,
        name,
      },
    });

    if (existing) {
      return next(
        new AppError(`Template with name "${name}" already exists`, 400),
      );
    }

    const template = await prisma.messageTemplate.create({
      data: {
        companyId,
        name,
        category: category || "MARKETING",
        components: components || [],
        language: language || "es",
        channel: channel || "WHATSAPP",
        subject: subject || undefined,
        status: status || "approved",
      },
    });

    Logger.info(
      `[Template] Created new template: ${template.name} (${template.id})`,
    );

    res.status(201).json({
      status: "success",
      data: { template },
    });
  },
);

/**
 * PATCH /templates/:id
 * Update template
 */
export const updateTemplate = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { name, category, components, language, subject, status } = req.body;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    // Verify template exists
    const existing = await prisma.messageTemplate.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      return next(new AppError("Template not found", 404));
    }

    // Check for duplicate name if changing name
    if (name && name !== existing.name) {
      const duplicate = await prisma.messageTemplate.findFirst({
        where: {
          companyId,
          name,
          id: { not: id },
        },
      });

      if (duplicate) {
        return next(
          new AppError(`Template with name "${name}" already exists`, 400),
        );
      }
    }

    const template = await prisma.messageTemplate.update({
      where: { id },
      data: {
        name,
        category,
        components,
        language,
        subject,
        status,
      },
    });

    Logger.info(
      `[Template] Updated template: ${template.name} (${template.id})`,
    );

    res.status(200).json({
      status: "success",
      data: { template },
    });
  },
);

/**
 * DELETE /templates/:id
 * Delete template
 */
export const deleteTemplate = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    // Verify template exists
    const existing = await prisma.messageTemplate.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      return next(new AppError("Template not found", 404));
    }

    await prisma.messageTemplate.delete({
      where: { id },
    });

    Logger.info(`[Template] Deleted template: ${existing.name} (${id})`);

    res.status(204).send();
  },
);

/**
 * POST /templates/:id/test
 * Test template by sending to a phone number
 */
export const testTemplateSend = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { to, parameters, conversationId, senderId } = req.body;
    const companyId = req.companyId || req.user?.companyId;
    const userId = req.user?.id;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    // Verify template exists
    const template = await prisma.messageTemplate.findFirst({
      where: { id, companyId },
    });

    if (!template) {
      return next(new AppError("Template not found", 404));
    }

    Logger.info(
      `[Template Test] Sending template ${template.name} to ${to} with params:`,
      parameters,
    );

    try {
      // Send template message using WhatsAppService
      const result = await whatsappService.sendTemplate(
        to,
        id,
        parameters || {},
        {
          companyId,
          conversationId: conversationId || `test-${Date.now()}`,
          senderId: senderId || userId || "system",
        },
      );

      res.status(200).json({
        status: "success",
        message: "Template message sent successfully",
        data: {
          template: {
            id: template.id,
            name: template.name,
          },
          result,
        },
      });
    } catch (error: any) {
      Logger.error("[Template Test] Error sending template:", error);
      return next(
        new AppError(`Failed to send template: ${error.message}`, 500),
      );
    }
  },
);
