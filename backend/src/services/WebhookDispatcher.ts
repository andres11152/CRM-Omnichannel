import axios from "axios";
import crypto from "crypto";
import { Logger } from "@/utils/logger";
import { webhookRepository } from "@/repositories/WebhookRepository";

/**
 * [WEBHOOK] PRODUCTION WEBHOOK DISPATCHER
 *
 * Dispatches standardized webhook events to tenant-configured URLs.
 * Features:
 * - Queries active webhooks from DB (no mocks)
 * - Per-webhook HMAC-SHA256 signatures
 * - Exponential backoff retry (3 attempts)
 * - Persistent delivery logs in DB
 *
 * Architecture: Service layer — reads from WebhookRepository.
 */

// ============================================================================
// TYPES
// ============================================================================

interface WebhookEventPayload {
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
const RETRY_DELAYS_MS = [0, 5_000, 15_000]; // Exponential backoff
const REQUEST_TIMEOUT_MS = 10_000;

// ============================================================================
// DISPATCHER
// ============================================================================

export const webhookDispatcher = {
  /**
   * Dispatches a webhook event to ALL active webhooks for a tenant
   * that are subscribed to the given event type.
   *
   * This is fire-and-forget from the caller's perspective.
   * Errors are logged but never thrown back to the caller.
   */
  async dispatch(
    companyId: string,
    eventType: string,
    payload: unknown,
  ): Promise<void> {
    try {
      // 1. Query active webhooks for this event
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

      // 2. Construct Stripe-like event object
      const eventId = `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const eventData: WebhookEventPayload = {
        id: eventId,
        object: "event",
        apiVersion: API_VERSION,
        created: Math.floor(Date.now() / 1000),
        type: eventType,
        data: {
          object: payload,
        },
      };

      // 3. Fan out to all subscribed webhooks (parallel, non-blocking)
      const deliveryPromises = webhooks.map((webhook) =>
        this.deliverWithRetry(companyId, webhook.id, webhook.url, webhook.secretKey, eventData),
      );

      // Fire and forget — don't await in the caller's context
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
      // Wait before retry (first attempt is immediate)
      const delay = RETRY_DELAYS_MS[attempt - 1] || 0;
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

      // Success — no need to retry
      if (lastResult.status >= 200 && lastResult.status < 300) {
        return lastResult;
      }

      // 4xx errors (except 429) are not retryable — client error
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
   * Logs the result to the database.
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
      // Create HMAC signature (only if webhook has a secret)
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
        // Don't throw on non-2xx — we handle status codes ourselves
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
      status = axiosError.response?.status || 0;
      errorMessage =
        err instanceof Error ? err.message : String(err);

      // Classify timeout vs connection errors
      if (axiosError.code === "ECONNABORTED") {
        errorMessage = `Timeout after ${REQUEST_TIMEOUT_MS}ms`;
      }

      Logger.error(
        `[Webhook] Delivery failed to ${url}: ${status} — ${errorMessage}`,
      );
    }

    const duration = Date.now() - startTime;

    // Persist delivery log (fire-and-forget, never block the delivery pipeline)
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
      })
      .catch((logErr) =>
        Logger.error("[Webhook] Failed to persist delivery log:", logErr as Error),
      );

    return { webhookId, url, status, duration, error: errorMessage, attempt };
  },

  /**
   * Replays a specific delivery log by ID.
   */
  async replayLog(companyId: string, logId: string) {
    const log = await webhookRepository.findDeliveryLogById(companyId, logId);
    if (!log) throw new Error("Log not found");
    if (!log.webhook) throw new Error("Original webhook deleted");
    if (!log.payload) throw new Error("No payload recorded for this log");

    const eventData = log.payload as {
      id: string;
      object: string;
      type: string; // Using string to prevent circular dependency or using WebhookEvents directly
      api_version: string;
      created: number;
      data: Record<string, unknown>;
    };

    // Dispatch the replay. We DO NOT await `deliver` because fire-and-forget is the standard
    const deliveryPromise = this.deliver(
      companyId,
      log.webhookId,
      log.url,
      log.webhook.secretKey,
      eventData
    );

    return { status: "Rescheduled for manual retry", logId };
  },

  // ===== QUERY METHODS (for WebhookService) =====

  /**
   * Get recent delivery logs for a company.
   * Now reads from the persistent DB instead of in-memory.
   */
  async getLogs(companyId: string) {
    try {
      return await webhookRepository.findDeliveryLogs(companyId, 20);
    } catch (error) {
      Logger.error("[Webhook] Failed to fetch delivery logs:", error as Error);
      return [];
    }
  },

  /**
   * Get signing secret guidance for a company.
   * Secrets are per-webhook now, so this returns documentation guidance.
   */
  getSigningSecret(_companyId: string): string {
    return "Each webhook endpoint has its own signing secret. Check individual webhook configurations.";
  },
};
