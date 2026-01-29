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
