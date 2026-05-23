import { Logger } from "@/utils/logger";
import { metaWebhookService } from "@/services/MetaWebhookService";
import type { MetaWebhookBody } from "@/services/MetaWebhookService";
import type { Request, Response } from "express";

// ─────────────────────────────────────────────────────
// [SEC] META CONTROLLER (Audit Hardened — Production Grade)
//
// Pure HTTP orchestrator for Meta Cloud API / WhatsApp Business API.
// ALL business logic is delegated to MetaWebhookService (SRP).
//
// Responsibilities:
// - Parse HTTP request (body, query params)
// - Respond with correct HTTP status codes
// - Delegate to MetaWebhookService
//
// NO business logic, NO database access, NO Prisma imports.
// ─────────────────────────────────────────────────────

const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

/**
 * 1. WEBHOOK VERIFICATION (Handshake)
 *
 * Meta sends a GET request to verify our webhook endpoint.
 * We validate the token and return the challenge.
 */
export const verifyWebhook = (req: Request, res: Response): void => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === META_VERIFY_TOKEN) {
      Logger.info("[MetaController] [OK] Webhook Verified! [ONLINE]");
      res.status(200).send(challenge);
    } else {
      Logger.warn("[MetaController] [WARNING] Verification failed: Token mismatch");
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
};

/**
 * 2. PROCESS INCOMING WEBHOOK (Entry Point)
 *
 * Meta sends a POST with the incoming message payload.
 * We ALWAYS return 200 to Meta to prevent retries, regardless of internal processing.
 * Internal errors are logged and monitored, not reflected to Meta.
 */
export const handleIncomingWebhook = async (
  req: Request,
  res: Response,
): Promise<void> => {
  // [SEC] CRITICAL: Always respond 200 to Meta FIRST to prevent retry storms.
  // Meta will retry up to 7 times with exponential backoff if we return non-2xx.
  res.sendStatus(200);

  try {
    const body = req.body as MetaWebhookBody;
    await metaWebhookService.processIncomingMessage(body);
  } catch (error: unknown) {
    // Log but NEVER crash — the 200 is already sent.
    Logger.error("[MetaController] [ERROR] Webhook processing failed:", error);
  }
};
