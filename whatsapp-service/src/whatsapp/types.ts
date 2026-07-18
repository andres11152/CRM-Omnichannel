export interface SessionConfig {
  sessionId: string;
  companyId: string;
  authDir?: string;
  phoneForPairing?: string;
}

export interface MessagePayload {
  sessionId: string;
  companyId: string;
  from: string;
  to: string;
  content: string;
  messageId: string;
  timestamp: Date;
  sender?: string;
  metadata?: Record<string, unknown>;
  dbId?: string;
}

export interface MediaPayload {
  type:
    | "image"
    | "video"
    | "audio"
    | "document"
    | "sticker"
    | "location"
    | "contact"
    | "note";
  url: string;
  buffer?: Buffer;
  mimetype: string;
  filename?: string;
  caption?: string;
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  contact?: {
    name: string;
    phone: string;
  };
}

export type GroupParticipantAction = "add" | "remove" | "promote" | "demote";
export type GroupSettingValue = "announcement" | "not_announcement" | "locked" | "unlocked";

export interface SessionStatus {
  sessionId: string;
  companyId?: string;
  status: "CONNECTED" | "DISCONNECTED" | "CONNECTING" | "FAILED" | "SCANNING";
  phone?: string;
  qrCode?: string;
  error?: string;
  updatedAt?: Date;
  createdAt?: Date;
  defaultQueueId?: string | null;
  proxyUrl?: string | null;
}

export interface SendMessageOptions {
  companyId: string;
  conversationId: string;
  senderId: string;
  media?: MediaPayload;
  metadata?: Record<string, unknown>;
  quotedMessageId?: string;
}

export interface TemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  text?: string;
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  url?: string;
  filename?: string;
  example?: TemplateHeaderExample;
  buttons?: TemplateButton[];
}

export interface TemplateHeaderExample {
  header_handle?: string[];
  header_text?: string[];
}

export interface TemplateButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
}
