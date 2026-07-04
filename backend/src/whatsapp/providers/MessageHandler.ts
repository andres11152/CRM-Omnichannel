import { IMessageHandler } from "../core/interfaces/IMessageHandler";
import { ISessionManager } from "../core/interfaces/ISessionManager";
import {
  SendMessageOptions,
  MediaPayload,
  MessagePayload,
} from "../core/types/whatsapp.types";
import { proto, WAMessage } from "@whiskeysockets/baileys";
import { EventBus } from "../core/events/EventBus";
import { WhatsAppEventType } from "../core/events/WhatsAppEvents";
import { runWithCompanyId } from "@/context/requestContext";

// [BUILD] SRP SERVICES
import { IdentityResolverService } from "../services/IdentityResolverService";
import { AITriggerService } from "../services/AITriggerService";
import { ProfilePictureService } from "../services/ProfilePictureService";

import { InboundMessageHandler } from "./handlers/InboundMessageHandler";
import { OutboundMessageHandler } from "./handlers/OutboundMessageHandler";
import { StatusUpdateHandler } from "./handlers/StatusUpdateHandler";
import { PresenceHandler } from "./handlers/PresenceHandler";
import { MessageRevocationHandler } from "./handlers/MessageRevocationHandler";
import { MessageReactionHandler } from "./handlers/MessageReactionHandler";
import { MessageEditHandler } from "./handlers/MessageEditHandler";
import { InboundOrchestratorService } from "../services/InboundOrchestratorService";
import { SessionData } from "@/types/whatsapp.types";

import { getWhatsAppQueue } from "../queue/WhatsAppQueue";
import { InboundWorker } from "../queue/workers/InboundWorker";
import { OutboundWorker } from "../queue/workers/OutboundWorker";
import { InboundCircuitBreaker } from "../services/InboundCircuitBreaker";
import redisClient from "@/config/redis";
import { Logger } from "@/utils/logger";

/**
 * [BUILD] MESSAGE HANDLER (Thin Orchestrator)
 *
 * After Phase 2 & 3 (BullMQ) refactoring, this class is now an
 * asynchronous routing layer. All heavy logic is offloaded to Redis queues.
 */
export class MessageHandler implements IMessageHandler {
  private eventBus: EventBus;
  private sessionCache = new Map<string, SessionData>();

  // [BUILD] Delegated handlers
  private inboundHandler: InboundMessageHandler;
  private outboundHandler: OutboundMessageHandler;
  private statusHandler: StatusUpdateHandler;
  private presenceHandler: PresenceHandler;
  private revocationHandler: MessageRevocationHandler;
  private reactionHandler: MessageReactionHandler;
  private editHandler: MessageEditHandler;

  // [BUILD] Background Workers
  private inboundWorker: InboundWorker;
  private outboundWorker: OutboundWorker;

  constructor(private sessionManager: ISessionManager) {
    this.eventBus = EventBus.getInstance();

    // Initialize SRP services
    const identityResolver = new IdentityResolverService(sessionManager);
    const profilePicService = new ProfilePictureService(sessionManager);

    // Wire up outbound first (needed by AITriggerService)
    this.outboundHandler = new OutboundMessageHandler(sessionManager);

    // AITriggerService uses outbound methods via delegation
    const aiTrigger = new AITriggerService({
      sendMessage: (to, content, options) =>
        this.sendMessage(to, content, options),
      sendMedia: (to, media, options) =>
        this.sendMedia(to, media as MediaPayload, options),
      sendPresenceUpdate: (to, type, companyId) =>
        this.sendPresenceUpdate(to, type, companyId),
    });

    // Wire up remaining handlers
    const inboundOrchestrator = new InboundOrchestratorService(
      sessionManager,
      identityResolver,
      profilePicService,
    );

    this.inboundHandler = new InboundMessageHandler(
      sessionManager,
      inboundOrchestrator,
      aiTrigger,
    );

    //  Start Workers
    this.inboundWorker = new InboundWorker(this.inboundHandler);
    this.outboundWorker = new OutboundWorker(this.outboundHandler);

    this.statusHandler = new StatusUpdateHandler(this.sessionCache);
    this.revocationHandler = new MessageRevocationHandler(this.sessionCache);
    this.reactionHandler = new MessageReactionHandler(this.sessionCache);
    this.editHandler = new MessageEditHandler(this.sessionCache);
    this.presenceHandler = new PresenceHandler(
      sessionManager,
      identityResolver,
    );

    this.subscribeToEvents();
  }

  // ────────────────────────────────────────────────
  // EVENT SUBSCRIPTION (Routing Layer)
  // ────────────────────────────────────────────────

  private subscribeToEvents(): void {
    this.eventBus.subscribe(
      WhatsAppEventType.MESSAGE_RECEIVED,
      async (event) => {
        //  OFF-LOAD TO QUEUE
        await this.handleIncoming(
          event.data.message,
          event.sessionId,
          event.companyId,
        );
      },
    );
    // ... reste del archivo ...

    this.eventBus.subscribe(WhatsAppEventType.MESSAGE_UPDATE, async (event) => {
      await this.statusHandler.handleMessageUpdate(
        event.data.messageId,
        event.data.update,
        event.sessionId,
      );
    });

    this.eventBus.subscribe(
      WhatsAppEventType.PRESENCE_UPDATE,
      async (event) => {
        await this.presenceHandler.handlePresenceUpdate(
          event.data,
          event.sessionId,
        );
      },
    );

    // ️ Message Revocation ("Delete for Everyone")
    this.eventBus.subscribe(
      WhatsAppEventType.MESSAGE_REVOKED,
      async (event) => {
        await this.revocationHandler.handleRevocation(
          event.data.revokedMessageId,
          event.data.revokedBy,
          event.data.fromMe,
          event.sessionId,
        );
      },
    );

    // ✏️ Message Edits
    this.eventBus.subscribe(
      WhatsAppEventType.MESSAGE_EDITED,
      async (event) => {
        await this.editHandler.handleEdit(
          event.data.originalMessageId,
          event.data.editedMessage,
          event.sessionId,
        );
      },
    );

    // ️ Message Reactions (Emojis)
    this.eventBus.subscribe(
      WhatsAppEventType.MESSAGE_REACTION,
      async (event) => {
        await this.reactionHandler.handleReaction(
          event.data.messageId,
          event.data.reaction,
          event.data.participant,
          event.sessionId,
          event.companyId, // [SEC] FIX: Pass companyId directly from event
        );
      },
    );

    // [DIAG] Confirm the inbound chain is wired. If this count is 0 for MESSAGE_RECEIVED,
    // inbound messages will be published but never enqueued (silent loss).
    const recvListeners = this.eventBus.listenerCount(WhatsAppEventType.MESSAGE_RECEIVED);
    Logger.info(
      `[MessageHandler] Subscribed to WhatsApp events. MESSAGE_RECEIVED listeners=${recvListeners} (EventBus instance ${this.eventBus.constructor.name})`,
    );
  }

  // ────────────────────────────────────────────────
  // IMessageHandler INTERFACE (Delegation)
  // ────────────────────────────────────────────────

  // [SEC] PROTOBUF SERIALIZATION: Use binary encoding to preserve byte fields
  // JSON.stringify destroys Uint8Array fields (mediaKey, fileEncSha256) → causes 'bad decrypt'.
  // Protobuf binary encoding preserves ALL fields with full fidelity for Redis transport.
  private serializeForQueue(message: proto.IWebMessageInfo): string {
    const encoded = proto.WebMessageInfo.encode(
      proto.WebMessageInfo.create(message),
    ).finish();
    return Buffer.from(encoded).toString("base64");
  }

  async handleIncoming(
    message: proto.IWebMessageInfo,
    sessionId: string,
    companyId: string,
  ): Promise<void> {
    const msgId = message.key?.id;

    // [SEC] CIRCUIT BREAKER: Evaluate if company is flooding the system
    const delayMs = await InboundCircuitBreaker.getDelayFor(companyId);

    // PRIMARY PATH: enqueue to BullMQ so heavy processing (media, S3, DB, AI) runs in the
    // worker, off the socket event loop. (Smoke test confirmed BullMQ consumes on this Redis.)
    try {
      const encodedMessage = this.serializeForQueue(message);
      const job = await getWhatsAppQueue().inboundQueue.add(
        "process-message",
        { encodedMessage, sessionId, companyId },
        { delay: delayMs },
      );
      Logger.info(`[MessageHandler] Inbound ${msgId} → enqueued to 'whatsapp-inbound' (job ${job.id})`);
    } catch (queueErr) {
      // BullMQ unavailable (Redis OOM/down) — process inline so no messages are lost.
      // runWithCompanyId provides the RLS context that doesMessageExist() & Prisma require.
      Logger.warn(
        `[MessageHandler] BullMQ enqueue failed for ${msgId}, processing INLINE: ${queueErr instanceof Error ? queueErr.message : String(queueErr)}`,
      );
      try {
        await runWithCompanyId(companyId, async () => {
          await this.inboundHandler.handleIncoming(message as WAMessage, sessionId);
        });
      } catch (inlineErr) {
        Logger.error(
          `[MessageHandler] Inline inbound fallback FAILED for ${msgId}: ${inlineErr instanceof Error ? inlineErr.message : String(inlineErr)}`,
          inlineErr instanceof Error ? inlineErr : undefined,
        );
      }
    }
  }

  /**
   * Calculates a progressive, human-like delay for outbound messages per company
   * to mimic human behavior and avoid WhatsApp spam detection.
   * If the message is manual (from an agent), it returns a tiny jitter and bypasses the progressive queue.
   */
  private async getOutboundDelayAndPriority(
    companyId: string,
    options: SendMessageOptions,
  ): Promise<{ delay: number; priority: number }> {
    const isAiGenerated = options.metadata?.aiGenerated === true;
    const isFlowGenerated = options.metadata?.flowGenerated === true;
    const isAutomated = isAiGenerated || isFlowGenerated;

    if (!isAutomated) {
      // Manual message gets high priority and minimal human delay to send immediately
      const manualJitter = Math.floor(Math.random() * 400) + 100; // 100ms - 500ms
      return { delay: manualJitter, priority: 1 };
    }

    if (!redisClient?.isOpen) {
      return { delay: 0, priority: 10 };
    }

    const key = `scheduler:outbound:${companyId}`;
    const now = Date.now();

    // Human-like delay config: average 3 seconds (2-5s range)
    const minDelay = parseInt(
      process.env.WA_OUTBOUND_MIN_DELAY_MS || "2000",
      10,
    );
    const maxDelay = parseInt(
      process.env.WA_OUTBOUND_MAX_DELAY_MS || "5000",
      10,
    );
    const jitter =
      Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    try {
      // Lua script to atomically calculate and set the next execution timestamp
      const luaScript = `
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local jitter = tonumber(ARGV[2])
        local next_send = redis.call('get', key)
        local scheduled = now
        if next_send then
          scheduled = math.max(now, tonumber(next_send))
        end
        local next_next = scheduled + jitter
        redis.call('setex', key, 86400, tostring(next_next))
        return tostring(scheduled - now)
      `;

      const delayStr = await redisClient.eval(luaScript, {
        keys: [key],
        arguments: [String(now), String(jitter)],
      });

      const delay = parseInt(delayStr as string, 10);
      return { delay: delay > 0 ? delay : 0, priority: 10 };
    } catch (err) {
      Logger.error(
        `[OutboundScheduler] Error calculating delay for ${companyId}:`,
        err,
      );
      return { delay: 0, priority: 10 };
    }
  }

  async sendMessage(
    to: string,
    content: string,
    options: SendMessageOptions,
  ): Promise<MessagePayload> {
    const { delay, priority } = await this.getOutboundDelayAndPriority(
      options.companyId,
      options,
    );

    const job = await getWhatsAppQueue().outboundQueue.add(
      "send-text",
      {
        type: "text",
        payload: { to, content, options },
      },
      {
        delay,
        priority,
      },
    );

    return {
      sessionId: "queued",
      companyId: options.companyId,
      from: "system",
      to,
      content,
      messageId: `job:${job.id}`,
      timestamp: new Date(),
    } as MessagePayload;
  }

  async sendMedia(
    to: string,
    media: MediaPayload,
    options: SendMessageOptions,
  ): Promise<MessagePayload> {
    const { delay, priority } = await this.getOutboundDelayAndPriority(
      options.companyId,
      options,
    );

    const job = await getWhatsAppQueue().outboundQueue.add(
      "send-media",
      {
        type: "media",
        payload: { to, media, options },
      },
      {
        delay,
        priority,
      },
    );

    return {
      sessionId: "queued",
      companyId: options.companyId,
      from: "system",
      to,
      content: media.caption || "Media",
      messageId: `job:${job.id}`,
      timestamp: new Date(),
    } as MessagePayload;
  }

  async markAsRead(messageId: string, sessionId: string): Promise<void> {
    return this.outboundHandler.markAsRead(messageId, sessionId);
  }

  async sendPresenceUpdate(
    to: string,
    type: "composing" | "recording" | "paused",
    companyId: string,
  ): Promise<void> {
    return this.outboundHandler.sendPresenceUpdate(to, type, companyId);
  }

  async sendReaction(
    to: string,
    messageId: string,
    reaction: string,
    companyId: string,
    fromMe?: boolean,
  ): Promise<void> {
    return this.outboundHandler.sendReaction(
      to,
      messageId,
      reaction,
      companyId,
      fromMe,
    );
  }
}
