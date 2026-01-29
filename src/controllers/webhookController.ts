import { Request, Response } from "express";
import { Logger } from "@/utils/logger";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { webhookService } from "@/services/webhookService";
import {
  whatsappWebhookSchema,
  createWebhookSchema,
  metaWebhookQuerySchema,
} from "@/schemas/webhookSchemas";

// ===================================
// 🎮 CONTROLLERS
// ===================================

/**
 * Handle incoming WhatsApp Webhook
 */
export const handleWhatsappWebhook = catchAsync(
  async (req: Request, res: Response) => {
    const { companyId } = req.params;

    // 1. Validation
    const payload = whatsappWebhookSchema.safeParse(req.body);

    if (!payload.success) {
      Logger.warn(`[Webhook] Invalid payload`, payload.error);
      return res.status(400).json({
        status: "error",
        message: "Invalid payload",
        errors: payload.error.flatten(),
      });
    }

    // 2. Respond immediately
    res.status(200).json({ status: "received" });

    // 3. Delegate Async Logic to Service
    webhookService.processIncomingWhatsapp(companyId, payload.data);
  },
);

/**
 * Meta Verification Challenge
 */
export const verifyMetaWebhook = catchAsync(
  async (req: Request, res: Response) => {
    // Validate Query Params strictly
    const query = metaWebhookQuerySchema.parse(req.query);

    const challenge = webhookService.verifyMetaChallenge(query);
    return res.status(200).send(challenge);
  },
);

/**
 * List Webhooks
 */
export const getCompanyWebhooks = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw new AppError("Unauthorized", 401);

    const webhooks = await webhookService.listWebhooks(companyId);

    return res.status(200).json({ status: "success", data: webhooks });
  },
);

/**
 * Create Webhook
 */
export const createWebhook = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw new AppError("Unauthorized", 401);

    const validatedBody = createWebhookSchema.parse(req.body);

    const webhook = await webhookService.createWebhook(
      companyId,
      validatedBody,
    );

    return res.status(201).json({ status: "success", data: webhook });
  },
);

/**
 * Delete Webhook
 */
export const deleteWebhook = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const { id } = req.params;

    if (!companyId) throw new AppError("Unauthorized", 401);

    await webhookService.deleteWebhook(id, companyId);

    return res.status(204).send();
  },
);

/**
 * Toggle Webhook
 */
export const toggleWebhook = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const { id } = req.params;

    if (!companyId) throw new AppError("Unauthorized", 401);

    const updated = await webhookService.toggleWebhook(id, companyId);

    return res.status(200).json({ status: "success", data: updated });
  },
);

/**
 * Get Logs
 */
export const getWebhookLogs = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw new AppError("Unauthorized", 401);

    const logs = webhookService.getLogs(companyId);

    return res.status(200).json({ status: "success", data: logs });
  },
);

/**
 * Get Secret
 */
export const getSigningSecret = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw new AppError("Unauthorized", 401);

    const secret = webhookService.getSigningSecret(companyId);

    return res
      .status(200)
      .json({ status: "success", data: { secretKey: secret } });
  },
);
