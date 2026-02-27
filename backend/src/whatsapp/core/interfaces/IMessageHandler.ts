import {
  MessagePayload,
  SendMessageOptions,
  MediaPayload,
} from "../types/whatsapp.types";

export interface IMessageHandler {
  handleIncoming(
    payload: { message: unknown } | unknown,
    sessionId: string,
  ): Promise<void>;
  sendMessage(
    to: string,
    content: string,
    options: SendMessageOptions,
  ): Promise<MessagePayload>;
  sendMedia(
    to: string,
    media: MediaPayload,
    options: SendMessageOptions,
  ): Promise<MessagePayload>;
  markAsRead(messageId: string, sessionId: string): Promise<void>;
  sendPresenceUpdate(
    to: string,
    type: "composing" | "recording" | "paused",
    companyId: string,
  ): Promise<void>;
}
