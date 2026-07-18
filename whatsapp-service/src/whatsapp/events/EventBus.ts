import { EventEmitter } from "events";
import { WhatsAppEvent, WhatsAppEventType } from "./WhatsAppEvents";
import { Logger } from "../../utils/logger";
import redisClient from "../../config/redis";

export class EventBus extends EventEmitter {
  private static instance: EventBus;

  private constructor() {
    super();
    this.setMaxListeners(100);
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  publish<T extends WhatsAppEventType>(event: WhatsAppEvent<T>): void {
    // 1. Emit locally (for local listeners like healer or sessionManager)
    this.emit(event.type, event);
    this.emit("*", event);

    // 2. Publish to Redis Pub/Sub for the CRM backend to receive
    // Exclude high-volume MESSAGE_RECEIVED which is enqueued via BullMQ directly
    if (redisClient?.isOpen && event.type !== WhatsAppEventType.MESSAGE_RECEIVED) {
      try {
        const payload = JSON.stringify(event);
        redisClient.publish("whatsapp:events", payload)
          .catch((err) => Logger.error(err, `[EventBus] Redis publish failed for ${event.type}:`));
      } catch (err) {
        Logger.error(err, `[EventBus] Failed to serialize event ${event.type}:`);
      }
    }
  }

  subscribe<T extends WhatsAppEventType>(
    eventType: T | "*",
    handler: (event: WhatsAppEvent<T>) => void | Promise<void>,
  ): () => void {
    const safeHandler = async (event: WhatsAppEvent<T>) => {
      try {
        await handler(event);
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        Logger.error(
          errorObj,
          `[EventBus] Unhandled error in subscriber for ${String(eventType)}:`
        );
      }
    };
    this.on(eventType, safeHandler);
    return () => this.off(eventType, safeHandler);
  }

  subscribeOnce<T extends WhatsAppEventType>(
    eventType: T,
    handler: (event: WhatsAppEvent<T>) => void | Promise<void>,
  ): void {
    this.once(eventType, handler);
  }

  unsubscribe<T extends WhatsAppEventType>(
    eventType: T | "*",
    handler: (event: WhatsAppEvent<T>) => void | Promise<void>,
  ): void {
    this.off(eventType, handler);
  }
}
