import { Request, Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { Logger } from "@/utils/logger";
import { instagramSessionRepository } from "@/instagram/InstagramSessionRepository";
import { instagramWebhookService } from "@/instagram/InstagramWebhookService";
import type { InstagramWebhookBody } from "@/instagram/InstagramWebhookService";

/**
 * GET /api/webhooks/instagram
 * Webhook Verification endpoint required by Meta.
 */
export const verifyInstagramWebhook = catchAsync(async (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token) {
    const session = await instagramSessionRepository.findSessionByVerifyToken(String(token));
    if (session) {
      Logger.info(`[InstagramWebhook] Verification successful for session: ${session.id}`);
      return res.status(200).send(challenge);
    }
  }

  Logger.warn("[InstagramWebhook] Verification failed or invalid payload", { query: req.query });
  return res.status(403).send("Forbidden");
});

/**
 * POST /api/webhooks/instagram
 * Incoming Instagram Messaging API webhook events.
 */
export const handleInstagramWebhookEvent = catchAsync(async (req: Request, res: Response) => {
  // [SEC] Always respond 200 immediately to prevent Meta retry storms; process async.
  res.status(200).json({ status: "received" });

  try {
    await instagramWebhookService.processIncomingMessage(req.body as InstagramWebhookBody);
  } catch (error) {
    Logger.error("[InstagramWebhook] Processing failed:", error);
  }
});
