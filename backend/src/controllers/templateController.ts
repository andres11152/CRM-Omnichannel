import { Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { whatsappService } from "@/whatsapp";
import { Logger } from "@/utils/logger";
import {
  templateCrudService,
  CreateTemplateDTO,
  UpdateTemplateDTO,
} from "@/services/templateCrudService";

/**
 * 📝 TEMPLATE CONTROLLER
 *
 * HTTP orchestrator for WhatsApp message templates.
 * All data access is delegated to templateCrudService (SRP).
 */

/**
 * GET /templates
 * List all templates for company
 */
export const getTemplates = catchAsync(
  async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return res
        .status(200)
        .json({ status: "success", results: 0, data: { templates: [] } });
    }

    const { category, channel, status, search, limit, offset } =
      req.query as Record<string, string | undefined>;

    const templates = await templateCrudService.findAll(companyId, {
      category,
      channel,
      status,
      search,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
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

    const template = await templateCrudService.findOne(id, companyId);

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
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    const template = await templateCrudService.create(
      companyId,
      req.body as CreateTemplateDTO,
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
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    const template = await templateCrudService.update(
      id,
      companyId,
      req.body as UpdateTemplateDTO,
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

    await templateCrudService.delete(id, companyId);

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

    const template = await templateCrudService.findOne(id, companyId);

    if (!template) {
      return next(new AppError("Template not found", 404));
    }

    Logger.info(
      `[Template Test] Sending template ${template.name} to ${to} with params:`,
      parameters,
    );

    try {
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
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      Logger.error("[Template Test] Error sending template:", error);
      return next(new AppError(`Failed to send template: ${errMsg}`, 500));
    }
  },
);
