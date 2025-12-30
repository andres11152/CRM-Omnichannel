import { WebhookEventType } from "@/types/index";
import { queueProducer } from "@/services/queueProducer";
import { Logger } from "@/utils/logger";
import { webhookService } from "./webhookService";
import { AppError } from "@/utils/AppError";

import { getErrorMessage } from "@/utils/errorHelpers";

export const webhookDispatcher = {
  /**
   * Trigger an event that might have webhook subscribers.
   */
  async trigger<T = unknown>(
    companyId: string,
    event: WebhookEventType,
    payload: T
  ) {
    try {
      // 1. Find active webhooks for this company that subscribe to this event
      const allWebhooks = await webhookService.getCompanyWebhooks(companyId);

      const subscribers = allWebhooks.filter((wh) => wh.events.includes(event));

      if (subscribers.length === 0) return;

      Logger.info(
        `[WebhookDispatcher] Found ${subscribers.length} subscribers for event '${event}' in company ${companyId}`
      );

      // 2. Enqueue a job for each subscriber (Fan-out pattern)
      for (const webhook of subscribers) {
        await queueProducer.addWebhookJob({
          companyId,
          webhookId: webhook.id,
          url: webhook.url,
          secret: webhook.secretKey,
          event,
          payload: {
            id: `evt_${Date.now()}`,
            event,
            created_at: new Date().toISOString(),
            data: payload,
          },
        });
      }
    } catch (error: unknown) {
      Logger.error(
        "[WebhookDispatcher] Error triggering webhooks",
        getErrorMessage(error)
      );
      // Don't block the main flow if webhooks fail
    }
  },
};
