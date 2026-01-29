import { EventBus } from "../core/events/EventBus";
import { WhatsAppEventType } from "../core/events/WhatsAppEvents";
import { prisma } from "@/config/database";

interface RateLimitConfig {
  maxMessages: number;
  windowSeconds: number;
}

export class RateLimitService {
  private rateLimits: Map<string, { count: number; resetAt: Date }> = new Map();
  private eventBus: EventBus;
  private config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.eventBus = EventBus.getInstance();
    this.config = {
      maxMessages:
        config?.maxMessages ||
        parseInt(process.env.WA_RATE_LIMIT_MAX_MESSAGES || "100"),
      windowSeconds:
        config?.windowSeconds ||
        parseInt(process.env.WA_RATE_LIMIT_WINDOW_SECONDS || "3600"),
    };

    this.subscribeToEvents();
  }

  private subscribeToEvents(): void {
    this.eventBus.subscribe(WhatsAppEventType.MESSAGE_SENT, (event) => {
      this.incrementCount(event.sessionId);
    });
  }

  async checkLimit(sessionId: string): Promise<boolean> {
    const limit = this.rateLimits.get(sessionId);
    const now = new Date();

    if (!limit || now > limit.resetAt) {
      this.rateLimits.set(sessionId, {
        count: 0,
        resetAt: new Date(now.getTime() + this.config.windowSeconds * 1000),
      });
      return true;
    }

    if (limit.count >= this.config.maxMessages) {
      const session = await prisma.whatsAppSession.findUnique({
        where: { sessionId },
      });

      if (session) {
        this.eventBus.publish({
          type: WhatsAppEventType.RATE_LIMIT_EXCEEDED,
          sessionId,
          companyId: session.companyId,
          timestamp: new Date(),
          data: {
            limit: this.config.maxMessages,
            current: limit.count,
          },
        });
      }

      return false;
    }

    return true;
  }

  private incrementCount(sessionId: string): void {
    const limit = this.rateLimits.get(sessionId);
    if (limit) {
      limit.count++;
    }
  }

  async enforceLimit(sessionId: string): Promise<void> {
    const allowed = await this.checkLimit(sessionId);
    if (!allowed) {
      const limit = this.rateLimits.get(sessionId);
      throw new Error(
        `Rate limit exceeded for session ${sessionId}. Reset at: ${limit?.resetAt.toISOString()}`,
      );
    }
  }

  resetLimit(sessionId: string): void {
    this.rateLimits.delete(sessionId);
  }

  getStats(sessionId: string): {
    count: number;
    limit: number;
    resetAt: Date | null;
  } {
    const limit = this.rateLimits.get(sessionId);
    return {
      count: limit?.count || 0,
      limit: this.config.maxMessages,
      resetAt: limit?.resetAt || null,
    };
  }
}
