import axios from "axios";
import crypto from "crypto";
import { Logger } from "@/utils/logger";
import { webhookRepository } from "@/repositories/WebhookRepository";

// ============================================================================
// TYPES
// ============================================================================

export interface WebhookEventPayload {
  id: string;
  object: "event";
  apiVersion: string;
  created: number;
  type: string;
  data: {
    object: unknown;
  };
}

interface DeliveryResult {
  webhookId: string;
  url: string;
  status: number;
  duration: number;
  error?: string;
  attempt: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const API_VERSION = "2025-04-01";
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [0, 5_000, 15_000];
const REQUEST_TIMEOUT_MS = 10_000;

// ============================================================================
// DISPATCHER
// ============================================================================

export const webhookDispatcher = {
  /**
   * Dispatches a webhook event to ALL active webhooks for a tenant
   * that are subscribed to the given event type.
   * Fire-and-forget from the caller's perspective.
   */
  async dispatch(
    companyId: string,
    eventType: string,
    payload: unknown,
  ): Promise<void> {
    try {
      const webhooks = await webhookRepository.findActiveByEvent(
        companyId,
        eventType,
      );

      if (webhooks.length === 0) {
        Logger.debug(
          `[Webhook] No active webhooks for ${eventType} in company ${companyId}`,
        );
        return;
      }

      const eventId = `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const eventData: WebhookEventPayload = {
        id: eventId,
        object: "event",
        apiVersion: API_VERSION,
        created: Math.floor(Date.now() / 1000),
        type: eventType,
        data: { object: payload },
      };

      const deliveryPromises = webhooks.map((webhook) =>
        this.deliverWithRetry(
          companyId,
          webhook.id,
          webhook.url,
          webhook.secretKey,
          eventData,
        ),
      );

      Promise.allSettled(deliveryPromises).then((results) => {
        const failures = results.filter((r) => r.status === "rejected");
        if (failures.length > 0) {
          Logger.warn(
            `[Webhook] ${failures.length}/${results.length} deliveries failed for ${eventType}`,
          );
        }
      });
    } catch (error) {
      Logger.error(
        `[Webhook] [CRITICAL] Dispatch setup failed for ${eventType}:`,
        error as Error,
      );
    }
  },

  /**
   * Delivers a webhook event with exponential backoff retry.
   * Logs each attempt to the database.
   */
  async deliverWithRetry(
    companyId: string,
    webhookId: string,
    url: string,
    secretKey: string | null,
    eventData: WebhookEventPayload,
  ): Promise<DeliveryResult> {
    let lastResult: DeliveryResult = {
      webhookId,
      url,
      status: 0,
      duration: 0,
      attempt: 0,
    };

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const delay = RETRY_DELAYS_MS[attempt - 1] ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      lastResult = await this.deliverOnce(
        companyId,
        webhookId,
        url,
        secretKey,
        eventData,
        attempt,
      );

      if (lastResult.status >= 200 && lastResult.status < 300) {
        return lastResult;
      }

      // 4xx (except 429) are client errors — not retryable
      if (
        lastResult.status >= 400 &&
        lastResult.status < 500 &&
        lastResult.status !== 429
      ) {
        Logger.warn(
          `[Webhook] Non-retryable ${lastResult.status} from ${url}. Aborting.`,
        );
        return lastResult;
      }

      Logger.warn(
        `[Webhook] Attempt ${attempt}/${MAX_RETRIES} failed for ${url} (${lastResult.status}). Retrying...`,
      );
    }

    return lastResult;
  },

  /**
   * Performs a single HTTP POST to the webhook URL.
   * Logs the result (including full payload) to the database so replays work.
   */
  async deliverOnce(
    companyId: string,
    webhookId: string,
    url: string,
    secretKey: string | null,
    eventData: WebhookEventPayload,
    attempt: number,
  ): Promise<DeliveryResult> {
    const jsonPayload = JSON.stringify(eventData);
    const startTime = Date.now();
    let status = 0;
    let errorMessage: string | undefined;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "Sentry-Webhook/1.0",
        "X-Sentry-Event-Id": eventData.id,
        "X-Sentry-Event-Type": eventData.type,
      };

      if (secretKey) {
        const timestamp = eventData.created;
        const signature = crypto
          .createHmac("sha256", secretKey)
          .update(`${timestamp}.${jsonPayload}`)
          .digest("hex");
        headers["X-Sentry-Signature"] = `t=${timestamp},v1=${signature}`;
      }

      const response = await axios.post(url, eventData, {
        headers,
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
      });

      status = response.status;

      if (status >= 200 && status < 300) {
        Logger.info(
          `[Webhook] [OK] Delivered ${eventData.type} to ${url} (${status}, attempt ${attempt})`,
        );
      }
    } catch (err: unknown) {
      const axiosError = err as { response?: { status: number }; code?: string };
      status = axiosError.response?.status ?? 0;
      errorMessage = err instanceof Error ? err.message : String(err);

      if (axiosError.code === "ECONNABORTED") {
        errorMessage = `Timeout after ${REQUEST_TIMEOUT_MS}ms`;
      }

      Logger.error(
        `[Webhook] Delivery failed to ${url}: ${status} — ${errorMessage}`,
      );
    }

    const duration = Date.now() - startTime;

    // Persist delivery log with payload so replays have the original event data
    webhookRepository
      .createDeliveryLog({
        companyId,
        webhookId,
        eventType: eventData.type,
        url,
        status,
        duration,
        error: errorMessage,
        attempt,
        payload: eventData as unknown as Record<string, unknown>,
      })
      .catch((logErr) =>
        Logger.error("[Webhook] Failed to persist delivery log:", logErr as Error),
      );

    return { webhookId, url, status, duration, error: errorMessage, attempt };
  },

  /**
   * Replays a specific delivery log by its ID.
   */
  async replayLog(companyId: string, logId: string) {
    const log = await webhookRepository.findDeliveryLogById(companyId, logId);
    if (!log) throw new Error("Log not found");
    if (!log.webhook) throw new Error("Original webhook deleted");
    if (!log.payload) throw new Error("No payload recorded for this log");

    const eventData = log.payload as unknown as WebhookEventPayload;

    // Fire-and-forget — do not await so the HTTP response returns immediately
    void this.deliverWithRetry(
      companyId,
      log.webhookId,
      log.url,
      log.webhook.secretKey,
      eventData,
    );

    return { status: "Rescheduled for manual retry", logId };
  },

  async getLogs(companyId: string) {
    try {
      return await webhookRepository.findDeliveryLogs(companyId, 20);
    } catch (error) {
      Logger.error("[Webhook] Failed to fetch delivery logs:", error as Error);
      return [];
    }
  },

  getSigningSecret(_companyId: string): string {
    return "Each webhook endpoint has its own signing secret. Check individual webhook configurations.";
  },
};
