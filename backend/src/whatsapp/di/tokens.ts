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

  // ── I/O ──────────────────────────────────────
  SocketEmitter: createToken<SocketEventEmitter>("WA.SocketEmitter"),
} as const;
