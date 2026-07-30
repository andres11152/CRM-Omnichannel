import { Response, NextFunction } from "express";
import { Webhook } from "svix";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { RequestWithRawBody } from "@/middleware/webhookVerifyMiddleware";

/**
 * Verifies Resend's Svix-signed webhook (svix-id / svix-timestamp /
 * svix-signature headers) against RESEND_WEBHOOK_SECRET, mirroring
 * verifyMetaWebhookSignature's raw-body-based approach.
 */
export const verifyResendWebhookSignature = (
  req: RequestWithRawBody,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const secret = process.env.RESEND_WEBHOOK_SECRET;

    if (!secret) {
      Logger.warn("[WebhookVerify] RESEND_WEBHOOK_SECRET is not configured. Bypassing signature verification.");
      return next();
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      return next(new AppError("Raw body is required for signature verification", 400));
    }

    const svixHeaders = {
      "svix-id": req.headers["svix-id"] as string,
      "svix-timestamp": req.headers["svix-timestamp"] as string,
      "svix-signature": req.headers["svix-signature"] as string,
    };

    if (!svixHeaders["svix-id"] || !svixHeaders["svix-timestamp"] || !svixHeaders["svix-signature"]) {
      return next(new AppError("Missing svix-* signature headers", 401));
    }

    const wh = new Webhook(secret);
    wh.verify(rawBody, svixHeaders); // throws on invalid signature

    next();
  } catch (error) {
    Logger.warn("[WebhookVerify] Resend webhook signature verification failed", { error });
    next(new AppError("Invalid webhook request signature", 403));
  }
};
