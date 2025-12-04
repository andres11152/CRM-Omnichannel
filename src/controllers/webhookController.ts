import { Request, Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { webhookService } from "@/services/webhookService";
import { AppError } from "@/utils/AppError";
import { HTTP_STATUS } from "@/constants/httpStatus";

import { prisma } from "@/config/prisma";

export const webhookController = {
  getCompanyWebhooks: catchAsync(async (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    if (!companyId) {
      throw new AppError("Company ID is required", HTTP_STATUS.BAD_REQUEST);
    }
    // Use prisma directly to get all (including inactive)
    const webhooks = await prisma.webhook.findMany({ where: { companyId } });
    res.status(HTTP_STATUS.OK).json(webhooks);
  }),

  createWebhook: catchAsync(async (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    if (!companyId) {
      throw new AppError("Company ID is required", HTTP_STATUS.BAD_REQUEST);
    }
    const { url, events, description } = req.body;
    if (!url || !events) {
      throw new AppError(
        "URL and events are required",
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const webhook = await prisma.webhook.create({
      data: {
        companyId,
        url,
        events,
        // description, // Add to schema if missing, or ignore
        isActive: true,
        secretKey:
          "whsec_" +
          Math.random().toString(36).substring(2, 15) +
          Math.random().toString(36).substring(2, 15),
      },
    });

    res.status(HTTP_STATUS.CREATED).json(webhook);
  }),

  deleteWebhook: catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const companyId = (req as any).companyId;
    await prisma.webhook.deleteMany({ where: { id, companyId } });
    res.status(204).send();
  }),

  toggleWebhook: catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const companyId = (req as any).companyId;
    const wh = await prisma.webhook.findFirst({ where: { id, companyId } });
    if (!wh) throw new AppError("Webhook not found", 404);

    const updated = await prisma.webhook.update({
      where: { id },
      data: { isActive: !wh.isActive },
    });
    res.json(updated);
  }),
};
