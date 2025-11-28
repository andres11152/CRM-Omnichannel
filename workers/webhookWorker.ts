
import crypto from 'crypto';
import { Logger } from '../src/utils/logger';

/**
 * WEBHOOK WORKER
 * Handles the delivery of outgoing webhooks to client servers.
 * Includes HMAC Signature logic for security.
 */

export const processWebhookJob = async (jobData: any) => {
  const { webhookId, url, secret, event, payload } = jobData;

  Logger.info(`[WebhookWorker] Sending event '${event}' to ${url} (ID: ${webhookId})`);

  try {
    // 1. Serialize Payload
    const payloadString = JSON.stringify(payload);

    // 2. Generate HMAC Signature (Security)
    // This allows the receiver to verify the request came from us.
    const signature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');

    // 3. Send HTTP Request
    // In a real worker, we use 'axios' or 'fetch'
    // Using fetch for standard compliance
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': `sha256=${signature}`,
        'User-Agent': 'OmniCRM-Webhook/1.0',
        'X-OmniCRM-Event': event
      },
      body: payloadString
    });

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }

    Logger.info(`[WebhookWorker] ✅ Delivery successful to ${url}`);
    
    // In real app: Update db.webhookDeliveryAttempts.create({ status: 'success' ... })

  } catch (error) {
    Logger.error(`[WebhookWorker] ❌ Delivery failed to ${url}`, error);
    // Throwing error here will cause BullMQ to retry based on backoff settings
    throw error;
  }
};
