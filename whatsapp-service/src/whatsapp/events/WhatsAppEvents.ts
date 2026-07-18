import { WAMessage, Contact, WAMessageUpdate } from "@whiskeysockets/baileys";

export enum WhatsAppEventType {
  SESSION_CONNECTED = "session.connected",
  SESSION_DISCONNECTED = "session.disconnected",
  SESSION_QR_CODE = "session.qr_code",
  SESSION_PAIRING_CODE = "session.pairing_code",
  SESSION_ERROR = "session.error",
  MESSAGE_RECEIVED = "message.received",
  MESSAGE_SENT = "message.sent",
  MESSAGE_FAILED = "message.failed",
  MESSAGE_UPDATE = "message.update",
  MESSAGE_REVOKED = "message.revoked",
  MESSAGE_REACTION = "message.reaction",
  PRESENCE_UPDATE = "presence.update",
  CONTACT_UPDATED = "contact.updated",
  RATE_LIMIT_EXCEEDED = "rate_limit.exceeded",
  MESSAGE_EDITED = "message.edited",
  CALL_RECEIVED = "call.received",
}

export interface WhatsAppEventData {
  [WhatsAppEventType.SESSION_CONNECTED]: { phone?: string };
  [WhatsAppEventType.SESSION_DISCONNECTED]: {
    reason?: string;
    isReconnecting?: boolean;
  };
  [WhatsAppEventType.SESSION_QR_CODE]: { qr: string };
  [WhatsAppEventType.SESSION_PAIRING_CODE]: { code: string };
  [WhatsAppEventType.SESSION_ERROR]: { error: Error };
  [WhatsAppEventType.MESSAGE_RECEIVED]: { message: WAMessage };
  [WhatsAppEventType.MESSAGE_SENT]: { message: WAMessage };
  [WhatsAppEventType.MESSAGE_FAILED]: { messageId: string; error: Error };
  [WhatsAppEventType.MESSAGE_UPDATE]: {
    messageId: string;
    update: WAMessageUpdate;
  };
  [WhatsAppEventType.MESSAGE_REVOKED]: {
    revokedMessageId: string;
    revokedBy: string;
    fromMe: boolean;
  };
  [WhatsAppEventType.MESSAGE_REACTION]: {
    messageId: string;
    reaction: string;
    participant: string;
  };
  [WhatsAppEventType.PRESENCE_UPDATE]: {
    id: string;
    presences: { [participant: string]: { lastKnownPresence: string } };
  };
  [WhatsAppEventType.CONTACT_UPDATED]: { contact: Contact };
  [WhatsAppEventType.RATE_LIMIT_EXCEEDED]: { limit: number; current: number };
  [WhatsAppEventType.MESSAGE_EDITED]: {
    originalMessageId: string;
    editedMessage: import("@whiskeysockets/baileys").proto.IMessage;
  };
  [WhatsAppEventType.CALL_RECEIVED]: {
    callId: string;
    from: string;
    isVideo: boolean;
    isGroup: boolean;
  };
}

export interface WhatsAppEvent<
  T extends WhatsAppEventType = WhatsAppEventType,
> {
  type: T;
  sessionId: string;
  companyId: string;
  timestamp: Date;
  data: WhatsAppEventData[T];
}
