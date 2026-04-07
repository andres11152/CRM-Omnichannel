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
    Logger.info(
      "[QueueProducer]  Message enqueued for delivery",
      data as unknown as Record<string, unknown>,
    );
    // await queue.add('send-message', data);
  },

  async addAITaskToQueue(data: AITaskData) {
    Logger.info(
      "[QueueProducer]  AI Task enqueued",
      data as unknown as Record<string, unknown>,
    );
    // await aiQueue.add('process-ai', data);
  },

  async addWebhookJob(data: WebhookJobData) {
    Logger.info(
      "[QueueProducer]  Webhook delivery enqueued",
      data as unknown as Record<string, unknown>,
    );
    // await webhookQueue.add('send-webhook', data);
  },
};
