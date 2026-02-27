import { IMessageHandler } from "../core/interfaces/IMessageHandler";
import { ISessionManager } from "../core/interfaces/ISessionManager";
import {
  MessagePayload,
  SendMessageOptions,
  MediaPayload,
} from "../core/types/whatsapp.types";
import { EventBus } from "../core/events/EventBus";
import { WhatsAppEventType } from "../core/events/WhatsAppEvents";
import { WAMessage } from "@whiskeysockets/baileys";

// 🏗️ SRP SERVICES
import { IdentityResolverService } from "../services/IdentityResolverService";
import { AITriggerService } from "../services/AITriggerService";
import { ProfilePictureService } from "../services/ProfilePictureService";

// 🏗️ EXTRACTED HANDLERS (Phase 2 Refactor)
import { InboundMessageHandler } from "./handlers/InboundMessageHandler";
import { OutboundMessageHandler } from "./handlers/OutboundMessageHandler";
import { StatusUpdateHandler } from "./handlers/StatusUpdateHandler";
import { PresenceHandler } from "./handlers/PresenceHandler";

import { SessionData } from "@/types/whatsapp.types";
import { Logger } from "@/utils/logger";

/**
 * 🏗️ MESSAGE HANDLER (Thin Orchestrator)
 *
 * After Phase 2 refactoring, this class is now a pure routing layer.
 * All heavyweight logic has been extracted into specialized handlers:
 *
 * - InboundMessageHandler:  Incoming message → identity, persist, AI trigger
 * - OutboundMessageHandler: sendMessage, sendMedia, markAsRead, sendPresenceUpdate
 * - StatusUpdateHandler:    Message status updates (sent → delivered → read)
 * - PresenceHandler:        Typing indicators (composing/recording/paused)
 *
 * Line count: ~120 ✅ (was 1048)
 */
export class MessageHandler implements IMessageHandler {
  private eventBus: EventBus;
  private sessionCache = new Map<string, SessionData>();

  // 🏗️ Delegated handlers
  private inboundHandler: InboundMessageHandler;
  private outboundHandler: OutboundMessageHandler;
  private statusHandler: StatusUpdateHandler;
  private presenceHandler: PresenceHandler;

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
    this.inboundHandler = new InboundMessageHandler(
      sessionManager,
      identityResolver,
      aiTrigger,
      profilePicService,
    );

    this.statusHandler = new StatusUpdateHandler(this.sessionCache);
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
        await this.handleIncoming(event.data.message, event.sessionId);
      },
    );

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
  }

  // ────────────────────────────────────────────────
  // IMessageHandler INTERFACE (Delegation)
  // ────────────────────────────────────────────────

  async handleIncoming(message: WAMessage, sessionId: string): Promise<void> {
    return this.inboundHandler.handleIncoming(message, sessionId);
  }

  async sendMessage(
    to: string,
    content: string,
    options: SendMessageOptions,
    retries = 3,
  ): Promise<MessagePayload> {
    return this.outboundHandler.sendMessage(to, content, options, retries);
  }

  async sendMedia(
    to: string,
    media: MediaPayload,
    options: SendMessageOptions,
    retries = 3,
  ): Promise<MessagePayload> {
    return this.outboundHandler.sendMedia(to, media, options, retries);
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
}
