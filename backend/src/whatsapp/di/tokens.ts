/**
 * ️ WHATSAPP DI TOKENS
 *
 * Type-safe injection tokens for all WhatsApp layer services.
 * Each token carries the type of the service it represents,
 * making container.resolve() fully type-safe.
 *
 * Naming Convention:
 * - Interfaces (I*) for core contracts
 * - Concrete names for specialized services
 */

import { createToken } from "@/config/container";
import { IWhatsAppProvider } from "../core/interfaces/IWhatsAppProvider";
import { ISessionManager } from "../core/interfaces/ISessionManager";
import { IMessageHandler } from "../core/interfaces/IMessageHandler";
import { IAuthProvider } from "../core/interfaces/IAuthProvider";
import type { RateLimitService } from "../services/RateLimitService";
import type { IdentityResolverService } from "../services/IdentityResolverService";
import type { AITriggerService } from "../services/AITriggerService";
import type { ProfilePictureService } from "../services/ProfilePictureService";
import type { DeduplicationService } from "../services/DeduplicationService";
import type { EventBus } from "../core/events/EventBus";
import type { SocketEventEmitter } from "@/services/SocketEventEmitter";
import type { WhatsAppMessaging } from "../services/WhatsAppMessaging";
import type { WhatsAppSessionService } from "../services/WhatsAppSessionService";

export const WA_TOKENS = {
  // ── Core Infrastructure ──────────────────────
  AuthProvider: createToken<IAuthProvider>("WA.AuthProvider"),
  SessionManager: createToken<ISessionManager>("WA.SessionManager"),
  MessageHandler: createToken<IMessageHandler>("WA.MessageHandler"),
  EventBus: createToken<EventBus>("WA.EventBus"),

  // ── Business Services ────────────────────────
  RateLimitService: createToken<RateLimitService>("WA.RateLimitService"),
  IdentityResolver: createToken<IdentityResolverService>("WA.IdentityResolver"),
  AITrigger: createToken<AITriggerService>("WA.AITrigger"),
  ProfilePicture: createToken<ProfilePictureService>("WA.ProfilePicture"),
  Deduplication: createToken<DeduplicationService>("WA.Deduplication"),
  
  // ── Segregated Facades ────────────────────────
  MessagingService: createToken<WhatsAppMessaging>("WA.MessagingService"),
  SessionService: createToken<WhatsAppSessionService>("WA.SessionService"),

  // ── Providers ────────────────────────────────
  BaileysProvider: createToken<IWhatsAppProvider>("WA.BaileysProvider"),
  MetaProvider: createToken<IWhatsAppProvider>("WA.MetaProvider"),

  // ── I/O ──────────────────────────────────────
  SocketEmitter: createToken<SocketEventEmitter>("WA.SocketEmitter"),
} as const;
