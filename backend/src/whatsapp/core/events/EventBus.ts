import { EventEmitter } from "events";
import { WhatsAppEvent, WhatsAppEventType } from "./WhatsAppEvents";
import { Logger } from "@/utils/logger";

type EventHandler<T extends WhatsAppEventType> = (
  event: WhatsAppEvent<T>,
) => void | Promise<void>;

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
    this.emit(event.type, event);
    this.emit("*", event);
  }

  subscribe<T extends WhatsAppEventType>(
    eventType: T | "*",
    handler: (event: WhatsAppEvent<T>) => void | Promise<void>,
  ): () => void {
    // Wrap with try/catch so async subscriber errors never become
    // unhandled promise rejections that silently kill the event chain.
    const safeHandler = async (event: WhatsAppEvent<T>) => {
      try {
        await handler(event);
      } catch (err) {
        Logger.error(
          `[EventBus] Unhandled error in subscriber for ${String(eventType)}:`,
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    };
    this.on(eventType, safeHandler);
    return () => this.off(eventType, safeHandler);
  }

  subscribeOnce<T extends WhatsAppEventType>(
    eventType: T,
    handler: EventHandler<T>,
  ): void {
    this.once(eventType, handler);
  }

  unsubscribe<T extends WhatsAppEventType>(
    eventType: T | "*",
    handler: (event: WhatsAppEvent<T>) => void | Promise<void>,
  ): void {
    this.off(eventType, handler);
  }

  async publishAsync<T extends WhatsAppEventType>(
    event: WhatsAppEvent<T>,
  ): Promise<void> {
    const handlers = this.listeners(event.type) as Array<EventHandler<T>>;
    const results = await Promise.allSettled(
      handlers.map(async (handler) => handler(event)),
    );

    // Provide robust logging to catch isolated subsystem failures
    results.forEach((result, idx) => {
      if (result.status === "rejected") {
        Logger.error(
          `[EventBus] [ALERT] Handler at index ${idx} failed for event ${event.type}:`,
          result.reason,
        );
      }
    });
  }
}
