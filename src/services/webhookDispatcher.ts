
import { WebhookEventType } from "../types/index";
import { MOCK_WEBHOOKS } from "../../constants";
import { queueProducer } from "./queueProducer";
import { Logger } from "../utils/logger";

// In a real app, this would query the DB: db.webhooks.findMany({ where: { companyId } })
const getCompanyWebhooks = async (companyId: string) => {
  return MOCK_WEBHOOKS.filter(wh => wh.companyId === companyId && wh.isActive);
};

export const webhookDispatcher = {
  
  /**
   * Trigger an event that might have webhook subscribers.
   */
  async trigger(companyId: string, event: WebhookEventType, payload: any) {
    try {
      // 1. Find active webhooks for this company that subscribe to this event
      const allWebhooks = await getCompanyWebhooks(companyId);
      
      const subscribers = allWebhooks.filter(wh => 
        wh.events.includes(event)
      );

      if (subscribers.length === 0) return;

      Logger.info(`[WebhookDispatcher] Found ${subscribers.length} subscribers for event '${event}' in company ${companyId}`);

      // 2. Enqueue a job for each subscriber (Fan-out pattern)
      for (const webhook of subscribers) {
        await queueProducer.addWebhookJob({
          webhookId: webhook.id,
          url: webhook.url,
          secret: webhook.secretKey,
          event,
          payload: {
            id: `evt_${Date.now()}`,
            event,
            created_at: new Date().toISOString(),
            data: payload
          }
        });
      }

    } catch (error) {
      Logger.error('[WebhookDispatcher] Error triggering webhooks', error);
    }
  }
};
