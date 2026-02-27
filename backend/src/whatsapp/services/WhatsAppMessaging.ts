/**
 * 📤 WHATSAPP MESSAGING SERVICE
 *
 * All outbound messaging logic:
 * - sendMessage: Direct message dispatch with rate limiting
 * - executeQueuedMessage: Worker interface for queue-based dispatch
 * - simulateTyping: Human-like typing indicators
 * - sendPresenceUpdate: Composing/recording/paused presence
 * - sendTemplate: Template hydration with media header support
 * - inferMimeType: MIME type inference from extension/format
 */

import { ISessionManager } from "../core/interfaces/ISessionManager";
import { IMessageHandler } from "../core/interfaces/IMessageHandler";
import { RateLimitService } from "../services/RateLimitService";
import {
  SendMessageOptions,
  MessagePayload,
  TemplateComponent,
  MediaPayload,
} from "../core/types/whatsapp.types";
import { messageTemplateRepository } from "@/repositories/MessageTemplateRepository";
import { AppError } from "@/utils/AppError";

export class WhatsAppMessaging {
  constructor(
    private sessionManager: ISessionManager,
    private messageHandler: IMessageHandler,
    private rateLimitService: RateLimitService,
  ) {}

  // ────────────────────────────────────────────────
  // SEND MESSAGE (Direct Execution)
  // ────────────────────────────────────────────────

  async sendMessage(
    to: string,
    content: string,
    options: SendMessageOptions,
  ): Promise<MessagePayload> {
    const activeSession = await this.sessionManager.findActiveSessionForCompany(
      options.companyId,
    );

    if (!activeSession) {
      throw new AppError(
        "No hay una sesión de WhatsApp activa. Por favor, ve a Configuración y escanea el código QR para reconectar.",
        503,
      );
    }

    await this.rateLimitService.enforceLimit(activeSession.sessionId);

    if (options.media) {
      return this.messageHandler.sendMedia(to, options.media, options);
    }
    return this.messageHandler.sendMessage(to, content, options);
  }

  // ────────────────────────────────────────────────
  // WORKER INTERFACE: Execute Queued Message
  // ────────────────────────────────────────────────

  async executeQueuedMessage(
    sessionId: string,
    to: string,
    content: string,
    options: SendMessageOptions,
  ) {
    await this.rateLimitService.enforceLimit(sessionId);

    if (options.media) {
      return this.messageHandler.sendMedia(to, options.media, options);
    }
    return this.messageHandler.sendMessage(to, content, options);
  }

  // ────────────────────────────────────────────────
  // TYPING SIMULATION
  // ────────────────────────────────────────────────

  async simulateTyping(sessionId: string, to: string) {
    const sock = this.sessionManager.getSession(sessionId);
    if (sock) {
      const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
      await sock.sendPresenceUpdate("composing", jid);
    }
  }

  // ────────────────────────────────────────────────
  // PRESENCE UPDATE (Composing/Recording)
  // ────────────────────────────────────────────────

  async sendPresenceUpdate(
    to: string,
    type: "composing" | "recording" | "paused",
    companyId: string,
  ): Promise<void> {
    const activeSession =
      await this.sessionManager.findActiveSessionForCompany(companyId);

    if (!activeSession) {
      return;
    }

    return this.messageHandler.sendPresenceUpdate(to, type, companyId);
  }

  // ────────────────────────────────────────────────
  // SEND TEMPLATE (Enhanced with Media Header)
  // ────────────────────────────────────────────────

  async sendTemplate(
    to: string,
    templateId: string,
    params: Record<string, string>,
    options: SendMessageOptions,
  ): Promise<MessagePayload> {
    const template = await messageTemplateRepository.findById(templateId);

    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const components = template.components as unknown as TemplateComponent[];

    // Extract HEADER (if media type)
    const header = components.find((c) => c.type === "HEADER");
    let mediaPayload: MediaPayload | undefined;

    if (header && header.format && header.format !== "TEXT") {
      const mediaUrl = header.url || (params["headerMediaUrl"] as string);

      if (mediaUrl) {
        const formatToType: Record<string, MediaPayload["type"]> = {
          IMAGE: "image",
          VIDEO: "video",
          DOCUMENT: "document",
        };

        mediaPayload = {
          type: formatToType[header.format] || "document",
          url: mediaUrl,
          mimetype: this.inferMimeType(header.format, mediaUrl),
          filename: header.filename || params["headerFilename"],
          caption: undefined,
        };
      }
    }

    // Extract BODY and hydrate with params
    let bodyText = components
      .filter((c) => c.type === "BODY")
      .map((c) => c.text || "")
      .join("\n");

    Object.entries(params).forEach(([key, value]) => {
      bodyText = bodyText.replace(new RegExp(`{{${key}}}`, "g"), value);
    });

    // Dispatch: Media with caption OR text only
    if (mediaPayload) {
      mediaPayload.caption = bodyText;
      return this.sendMessage(to, bodyText, {
        ...options,
        media: mediaPayload,
      });
    }

    return this.sendMessage(to, bodyText, options);
  }

  // ────────────────────────────────────────────────
  // MIME TYPE INFERENCE
  // ────────────────────────────────────────────────

  inferMimeType(format: string, url: string): string {
    const ext = url.split(".").pop()?.toLowerCase() || "";

    const mimeMap: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      mp4: "video/mp4",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };

    if (mimeMap[ext]) return mimeMap[ext];

    const formatDefaults: Record<string, string> = {
      IMAGE: "image/jpeg",
      VIDEO: "video/mp4",
      DOCUMENT: "application/octet-stream",
    };

    return formatDefaults[format] || "application/octet-stream";
  }
}
