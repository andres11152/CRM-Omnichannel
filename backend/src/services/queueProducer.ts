import { Logger } from "../utils/logger";
import {
  MessageJobData,
  AITaskData,
  WebhookJobData,
} from "../types/queue.types";

/**
 * QUEUE PRODUCER
 * Handles adding jobs to the Redis Queue (BullMQ).
 * Mock implementation for scalability demo.
 */
export const queueProducer = {
  async addMessageToQueue(data: MessageJobData) {
    Logger.info("[QueueProducer] 📤 Message enqueued for delivery", data);
    // await queue.add('send-message', data);
  },

  async addAITaskToQueue(data: AITaskData) {
    Logger.info("[QueueProducer] 🧠 AI Task enqueued", data);
    // await aiQueue.add('process-ai', data);
  },

  async addWebhookJob(data: WebhookJobData) {
    Logger.info("[QueueProducer] 🔗 Webhook delivery enqueued", data);
    // await webhookQueue.add('send-webhook', data);
  },
};
