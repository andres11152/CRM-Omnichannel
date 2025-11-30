import { Request, Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { webhookService } from "@/services/webhookService";
import { AppError } from "@/utils/AppError";
import { HTTP_STATUS } from "@/constants/httpStatus";

export const webhookController = {
  getCompanyWebhooks: catchAsync(async (req: Request, res: Response) => {
    const companyId = (req as any).user?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is required", HTTP_STATUS.BAD_REQUEST);
    }
    const webhooks = await webhookService.getCompanyWebhooks(companyId);
    res.status(HTTP_STATUS.OK).json(webhooks);
  }),

  createWebhook: catchAsync(async (req: Request, res: Response) => {
    const companyId = (req as any).user?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is required", HTTP_STATUS.BAD_REQUEST);
    }
    const { url, events } = req.body;
    if (!url || !events) {
      throw new AppError(
        "URL and events are required",
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const webhook = await webhookService.createWebhook({
      companyId,
      url,
      events,
    });

    res.status(HTTP_STATUS.CREATED).json(webhook);
  }),
};
