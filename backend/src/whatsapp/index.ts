export { WhatsAppService, whatsappService } from "./WhatsAppService";
export { EventBus } from "./core/events/EventBus";
export { WhatsAppEventType } from "./core/events/WhatsAppEvents";
export type { WhatsAppEvent } from "./core/events/WhatsAppEvents";
export type {
  SessionConfig,
  MessagePayload,
  MediaPayload,
  SessionStatus,
  SendMessageOptions,
} from "./core/types/whatsapp.types";
export type { ISessionManager } from "./core/interfaces/ISessionManager";
export type { IMessageHandler } from "./core/interfaces/IMessageHandler";
export type { IAuthProvider } from "./core/interfaces/IAuthProvider";

// ── Segregated Service Exports (SOLID - ISP) ──
import { container } from "@/config/container";
import { WA_TOKENS } from "./di/tokens";

// Ensure the Facade instantiates the DI container first
import { whatsappService } from "./WhatsAppService";
void whatsappService; // Force initialization

export const whatsappMessagingService = container.resolve(WA_TOKENS.MessagingService);
export const whatsappSessionService = container.resolve(WA_TOKENS.SessionService);
