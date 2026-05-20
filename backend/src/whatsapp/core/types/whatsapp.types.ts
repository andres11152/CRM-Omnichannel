export interface SessionConfig {
  sessionId: string;
  companyId: string;
  /** @deprecated Ignored. DatabaseAuthProvider handles all credential storage. */
  authDir?: string;
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
}

export interface SessionStatus {
  sessionId: string;
  companyId?: string;
  status: "CONNECTED" | "DISCONNECTED" | "CONNECTING" | "FAILED" | "SCANNING";
  phone?: string;
  qrCode?: string;
  error?: string;
  updatedAt?: Date;
  defaultQueueId?: string | null;
  proxyUrl?: string | null;
}

export interface SendMessageOptions {
  companyId: string;
  conversationId: string;
  senderId: string;
  media?: MediaPayload;
  metadata?: Record<string, unknown>;
  /** WhatsApp message ID to quote/reply to */
  quotedMessageId?: string;
}

export interface TemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  text?: string;
  /** HEADER format: TEXT, IMAGE, VIDEO, DOCUMENT */
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  /** URL for media headers (IMAGE, VIDEO, DOCUMENT) */
  url?: string;
  /** Filename for document headers */
  filename?: string;
  /** Example data for template preview */
  example?: TemplateHeaderExample;
  /** Button configurations */
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
