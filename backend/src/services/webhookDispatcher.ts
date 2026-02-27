import axios from "axios";
import crypto from "crypto";
import { Logger } from "@/utils/logger";

// 🧠 IN-MEMORY MOCK DB FOR WEBHOOKS
const WEBHOOK_CONFIGS: Record<string, string> = {
  default: "https://webhook.site/26e3c162-8e1c-43f6-b184-5f504d6074d2",
};

const DELIVERY_LOGS: Record<string, unknown>[] = [];

export const webhookDispatcher = {
  /**
   * Dispatches a standardized webhook event to the tenant's configured URL.
   */
  async dispatch(tenantId: string, eventType: string, payload: unknown) {
    // 1. Get Tenant Config
    const webhookUrl = WEBHOOK_CONFIGS[tenantId] || WEBHOOK_CONFIGS["default"];
    const apiSecret = "whsec_rEply_SuP3r_sEcr3t_K3y_8823"; // Mock Secret

    if (!webhookUrl) return;

    // 2. Construct Event Object (Stripe-like format)
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const eventData = {
      id: eventId,
      object: "event",
      apiVersion: "2024-01-01",
      created: Math.floor(Date.now() / 1000),
      type: eventType,
      data: {
        object: payload,
      },
    };

    const jsonPayload = JSON.stringify(eventData);

    // 3. Create Signature (HMAC-SHA256)
    const signature = crypto
      .createHmac("sha256", apiSecret)
      .update(jsonPayload)
      .digest("hex");

    // 4. Send Request
    const startTime = Date.now();
    let status = 200;
    let errorMessage = "";

    try {
      await axios.post(webhookUrl, eventData, {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Reply-Webhook-Bot/1.0",
          "X-Reply-Signature": `t=${eventData.created},v1=${signature}`,
          "X-Reply-Event-Id": eventId,
        },
        timeout: 5000,
      });
      Logger.info(`✅ [Webhook] Delivered ${eventType} to ${webhookUrl}`);
    } catch (err: unknown) {
      status =
        (err as { response?: { status: number } }).response?.status || 500;
      errorMessage = err instanceof Error ? err.message : String(err);
      Logger.error(`❌ [Webhook] Delivery Failed: ${status}`, {
        error: errorMessage,
      });
    }

    // 5. Log Result
    const logEntry = {
      id: `del_${Date.now()}`,
      tenantId,
      eventType,
      status,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      error: errorMessage || undefined,
    };

    DELIVERY_LOGS.unshift(logEntry);
    if (DELIVERY_LOGS.length > 50) DELIVERY_LOGS.pop();
  },

  getLogs(_tenantId: string) {
    return DELIVERY_LOGS.slice(0, 10);
  },

  getSigningSecret(_tenantId: string) {
    return "whsec_rEply_SuP3r_sEcr3t_K3y_8823";
  },
};
