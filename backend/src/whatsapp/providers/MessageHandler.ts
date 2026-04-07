import { IMessageHandler } from "../core/interfaces/IMessageHandler";
import { ISessionManager } from "../core/interfaces/ISessionManager";
import {
  SendMessageOptions,
  MediaPayload,
  MessagePayload,
} from "../core/types/whatsapp.types";
import { proto } from "@whiskeysockets/baileys";
import { EventBus } from "../core/events/EventBus";
import { WhatsAppEventType } from "../core/events/WhatsAppEvents";

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
import { InboundOrchestratorService } from "../services/InboundOrchestratorService";
import { SessionData } from "@/types/whatsapp.types";

import { getWhatsAppQueue } from "../queue/WhatsAppQueue";
import { InboundWorker } from "../queue/workers/InboundWorker";
import { OutboundWorker } from "../queue/workers/OutboundWorker";

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
        await this.handleIncoming(event.data.message, event.sessionId, event.companyId);
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
  }

  // ────────────────────────────────────────────────
  // IMessageHandler INTERFACE (Delegation)
  // ────────────────────────────────────────────────

  // Helper to strip defective Baileys prototypes before BullMQ serialization
  private deepCopyPlain(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') return obj;
    
    // Convert Buffer/Uint8Array to standard Base64 string for safe Redis transport
    // rather than relying on BullMQ's default buffer handling
    if (Buffer.isBuffer(obj) || obj instanceof Uint8Array) {
      return Buffer.from(obj);
    }

    // Convert Long.js objects (used aggressively by Baileys for messageTimestamps) into JS Numbers
    if ('toNumber' in obj && typeof (obj as { toNumber: () => number }).toNumber === 'function') {
      return (obj as { toNumber: () => number }).toNumber();
    }

    if (Array.isArray(obj)) return obj.map((item) => this.deepCopyPlain(item));
    
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const val = (obj as Record<string, unknown>)[key];
      // [SEC] CRITICAL: Never copy functions (like toJSON) into the serialized object
      // This prevents Baileys defective prototypes from crashing BullMQ serialization
      if (typeof val === 'function') continue;
      
      result[key] = this.deepCopyPlain(val);
    }
    return result;
  }

  async handleIncoming(message: proto.IWebMessageInfo, sessionId: string, companyId: string): Promise<void> {
    const plainMessage = this.deepCopyPlain(message) as proto.IWebMessageInfo;

    await getWhatsAppQueue().inboundQueue.add("process-message", {
      message: plainMessage,
      sessionId,
      companyId,
    });
  }

  async sendMessage(
    to: string,
    content: string,
    options: SendMessageOptions,
  ): Promise<MessagePayload> {
    const job = await getWhatsAppQueue().outboundQueue.add("send-text", {
      type: "text",
      payload: { to, content, options },
    });
    
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
    const job = await getWhatsAppQueue().outboundQueue.add("send-media", {
      type: "media",
      payload: { to, media, options },
    });

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
