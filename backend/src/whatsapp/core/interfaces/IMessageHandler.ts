import {
  MessagePayload,
  SendMessageOptions,
  MediaPayload,
} from "../types/whatsapp.types";
import { proto, ChatModification } from "@whiskeysockets/baileys";

export interface IMessageHandler {
  handleIncoming(
    message: proto.IWebMessageInfo,
    sessionId: string,
    companyId: string,
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
  sendReaction(
    to: string,
    messageId: string,
    reaction: string,
    companyId: string,
    fromMe?: boolean,
  ): Promise<void>;
  editOutboundMessage(
    to: string,
    messageId: string,
    newContent: string,
    companyId: string,
  ): Promise<void>;
  revokeOutboundMessage(
    to: string,
    messageId: string,
    companyId: string,
  ): Promise<void>;
  updateBlockStatus(
    to: string,
    action: "block" | "unblock",
    companyId: string,
  ): Promise<void>;
  modifyChat(
    to: string,
    companyId: string,
    mod: ChatModification,
  ): Promise<void>;
}
