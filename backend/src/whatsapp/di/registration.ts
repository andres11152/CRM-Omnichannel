/**
 *  WHATSAPP DI REGISTRATION
 *
 * Composition Root for the WhatsApp module.
 * This is the ONLY place where concrete implementations are instantiated.
 * All other files resolve dependencies from the container.
 *
 * Call registerWhatsAppServices() once during application bootstrap.
 */

import { container } from "@/config/container";
import { WA_TOKENS } from "./tokens";

// Concrete Implementations
import { DatabaseAuthProvider } from "../providers/AuthProvider";
import { SessionManager } from "../providers/SessionManager";
import { MessageHandler } from "../providers/MessageHandler";
import { EventBus } from "../core/events/EventBus";
import { RateLimitService } from "../services/RateLimitService";
import { IdentityResolverService } from "../services/IdentityResolverService";
import { AITriggerService } from "../services/AITriggerService";
import { ProfilePictureService } from "../services/ProfilePictureService";
import { deduplicationService } from "../services/DeduplicationService";
import { SocketEventEmitter } from "@/services/SocketEventEmitter";
import { gateway } from "@/gateways/socketGateway";
import { MediaPayload } from "../core/types/whatsapp.types";
import { IMessageHandler } from "../core/interfaces/IMessageHandler";
import { WhatsAppSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { WhatsAppMessaging } from "../services/WhatsAppMessaging";
import { WhatsAppSessionService } from "../services/WhatsAppSessionService";
import { BaileysProviderService } from "../services/BaileysProviderService";
import { MetaProviderService } from "../services/MetaProviderService";

export function registerWhatsAppServices(): void {
  // ── EventBus (Singleton — shared pub/sub backbone) ──
  container.registerInstance(WA_TOKENS.EventBus, EventBus.getInstance());

  // ── Deduplication (Already a singleton export) ──
  container.registerInstance(WA_TOKENS.Deduplication, deduplicationService);

  // ── Socket Emitter ──
  container.registerSingleton(
    WA_TOKENS.SocketEmitter,
    () => new SocketEventEmitter(gateway),
  );

  // ── Auth Provider ──
  container.registerSingleton(
    WA_TOKENS.AuthProvider,
    () => new DatabaseAuthProvider(),
  );

  // ── Session Manager (depends on AuthProvider) ──
  container.registerSingleton(WA_TOKENS.SessionManager, () => {
    const authProvider = container.resolve(WA_TOKENS.AuthProvider);
    return new SessionManager(authProvider);
  });

  // ── Rate Limit Service ──
  container.registerSingleton(
    WA_TOKENS.RateLimitService,
    () => new RateLimitService(),
  );

  // ── Identity Resolver (depends on SessionManager) ──
  container.registerSingleton(WA_TOKENS.IdentityResolver, () => {
    const sessionManager = container.resolve(WA_TOKENS.SessionManager);
    return new IdentityResolverService(sessionManager);
  });

  // ── Profile Picture Service (depends on SessionManager) ──
  container.registerSingleton(WA_TOKENS.ProfilePicture, () => {
    const sessionManager = container.resolve(WA_TOKENS.SessionManager);
    return new ProfilePictureService(sessionManager);
  });

  // ── Message Handler (depends on SessionManager — full orchestrator) ──
  container.registerSingleton(WA_TOKENS.MessageHandler, () => {
    const sessionManager = container.resolve(WA_TOKENS.SessionManager);
    return new MessageHandler(sessionManager);
  });

  // ── AI Trigger (depends on MessageHandler for send callbacks) ──
  // NOTE: Registered AFTER MessageHandler because it needs send callbacks
  container.registerSingleton(WA_TOKENS.AITrigger, () => {
    const messageHandler = container.resolve(
      WA_TOKENS.MessageHandler,
    ) as IMessageHandler;
    return new AITriggerService({
      sendMessage: (to, content, options) =>
        messageHandler.sendMessage(to, content, options),
      sendMedia: (to, media, options) =>
        messageHandler.sendMedia(to, media as MediaPayload, options),
      sendPresenceUpdate: (to, type, companyId) =>
        messageHandler.sendPresenceUpdate(to, type, companyId),
    });
  });

  // ── Segregated Services (Fixing God Class) ──
  container.registerSingleton(WA_TOKENS.MessagingService, () => {
    const sessionManager = container.resolve(WA_TOKENS.SessionManager);
    const messageHandler = container.resolve(WA_TOKENS.MessageHandler);
    const rateLimitService = container.resolve(WA_TOKENS.RateLimitService);
    return new WhatsAppMessaging(sessionManager, messageHandler as IMessageHandler, rateLimitService);
  });

  container.registerSingleton(WA_TOKENS.SessionService, () => {
    const sessionManager = container.resolve(WA_TOKENS.SessionManager);
    const sessionRepository = new WhatsAppSessionRepository();
    return new WhatsAppSessionService(sessionManager, sessionRepository);
  });

  // ── Providers ──
  container.registerSingleton(
    WA_TOKENS.BaileysProvider,
    () => new BaileysProviderService(),
  );

  container.registerSingleton(
    WA_TOKENS.MetaProvider,
    () => new MetaProviderService(),
  );
}
