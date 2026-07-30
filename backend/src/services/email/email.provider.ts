import {
  IEmailProvider,
  NodemailerConfig,
  ProviderConfig,
  SendEmailParams,
  SendEmailResult,
  WebhookEvent,
  WebhookEventType,
} from "../../types/email.types";

/**
 * Abstract Email Provider
 * Allows switching between Nodemailer, SendGrid, AWS SES without breaking code
 */
export abstract class BaseEmailProvider implements IEmailProvider {
  abstract sendEmail(params: SendEmailParams): Promise<SendEmailResult>;
  abstract parseWebhook(body: unknown, headers: unknown): WebhookEvent | null;
  abstract verifyWebhookSignature(body: unknown, signature: string): boolean;
}

// ===================================
// NODEMAILER IMPLEMENTATION
// ===================================

import nodemailer, { Transporter } from "nodemailer";
import { Logger } from "../../utils/logger";
import { SystemEmailService } from "../EmailService";

export class NodemailerProvider extends BaseEmailProvider {
  private transporter: Transporter;

  constructor(config?: NodemailerConfig, companyId?: string) {
    super();

    if (config) {
      // Multi-Tenant Mode
      const isSecure = config.secure || config.port === 465;

      // [SEC] Decrypt SMTP password if it's encrypted (tenant-scoped)
      let smtpPass = config.pass;
      if (companyId && smtpPass) {
        const decrypted = SystemEmailService.decryptSmtpPassword(smtpPass, companyId);
        if (decrypted) {
          smtpPass = decrypted;
        }
        // If decryption fails, assume plaintext (backward compatible for pre-encryption tenants)
      }

      this.transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: isSecure,
        auth: {
          user: config.user,
          pass: smtpPass,
        },
        tls: {
          rejectUnauthorized: process.env.NODE_ENV === "production",
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 30000,
      });
      Logger.info("[NodemailerProvider] Initialized with Tenant SMTP:", {
        host: config.host,
        port: config.port,
        secure: isSecure,
        companyId: companyId || "N/A",
      });
    } else {
      // Global / System Mode (Fallback)
      const host = process.env.SMTP_HOST;
      const port = parseInt(process.env.SMTP_PORT || "587");
      const isSecure = process.env.SMTP_SECURE === "true" || port === 465;
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASSWORD;

      if (!host || !user || !pass) {
        Logger.warn(
          "[NodemailerProvider] SMTP variables are missing in .env. Falling back to unconfigured transporter state."
        );
      }

      this.transporter = nodemailer.createTransport({
        host: host || "localhost",
        port,
        secure: isSecure,
        auth: user && pass ? { user, pass } : undefined,
        tls: {
          rejectUnauthorized: process.env.NODE_ENV === "production",
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 30000,
      });
      Logger.info(
        `[NodemailerProvider] Initialized Global SMTP (${host || "localhost"}:${port}, secure:${isSecure})`,
      );
    }
  }

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    try {
      const mailOptions = {
        from: params.from,
        to: Array.isArray(params.to) ? params.to.join(", ") : params.to,
        cc: params.cc?.join(", "),
        bcc: params.bcc?.join(", "),
        subject: params.subject,
        html: params.htmlBody,
        text: params.textBody,
        replyTo: params.replyTo,
        attachments: params.attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
          path: att.path,
          contentType: att.contentType,
        })),
      };

      const info = await this.transporter.sendMail(mailOptions);

      Logger.info(`[NodemailerProvider] Email sent: ${info.messageId}`);

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error("[NodemailerProvider] Send failed:", error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  parseWebhook(_body: unknown, _headers: unknown): WebhookEvent | null {
    // Nodemailer doesn't have webhooks by default
    // This would be implemented if using a service like SendGrid/Mailgun
    Logger.warn("[NodemailerProvider] Webhook parsing not supported");
    return null;
  }

  verifyWebhookSignature(_body: unknown, _signature: string): boolean {
    // Not applicable for Nodemailer
    return true;
  }
}

// ===================================
// SENDGRID IMPLEMENTATION (Future)
// ===================================

export class SendGridProvider extends BaseEmailProvider {
  private apiKey: string;

  constructor() {
    super();
    this.apiKey = process.env.SENDGRID_API_KEY || "";
    if (!this.apiKey) {
      Logger.warn("[SendGridProvider] API key missing");
    }
  }

  async sendEmail(_params: SendEmailParams): Promise<SendEmailResult> {
    // TODO: Implement || SendGrid
    throw new Error("SendGridProvider not implemented yet");
  }

  parseWebhook(_body: unknown, _headers: unknown): WebhookEvent | null {
    // TODO: Implement SendGrid webhook || parsing
    // Example: https://docs.sendgrid.com/for-developers/tracking-events/event
    return null;
  }

  verifyWebhookSignature(_body: unknown, _signature: string): boolean {
    // TODO: Implement SendGrid signature || verification
    return false;
  }
}

// ===================================
// RESEND IMPLEMENTATION
// ===================================

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: { email_id?: string; [key: string]: unknown };
}

const RESEND_EVENT_MAP: Record<string, WebhookEventType> = {
  "email.delivered": WebhookEventType.DELIVERED,
  "email.opened": WebhookEventType.OPENED,
  "email.clicked": WebhookEventType.CLICKED,
  "email.bounced": WebhookEventType.BOUNCED,
  "email.complained": WebhookEventType.SPAM,
  "email.delivery_delayed": WebhookEventType.FAILED,
};

export class ResendProvider extends BaseEmailProvider {
  private apiKey: string;

  constructor() {
    super();
    this.apiKey = process.env.RESEND_API_KEY || "";
    if (!this.apiKey) {
      Logger.warn("[ResendProvider] RESEND_API_KEY is missing — sends will fail until it's configured");
    }
  }

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    if (!this.apiKey) {
      return { success: false, error: "RESEND_API_KEY is not configured" };
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: params.from,
          to: Array.isArray(params.to) ? params.to : [params.to],
          cc: params.cc,
          bcc: params.bcc,
          subject: params.subject,
          html: params.htmlBody,
          text: params.textBody,
          reply_to: params.replyTo,
          headers: params.headers,
          attachments: params.attachments?.map((att) => ({
            filename: att.filename,
            content: typeof att.content === "string" ? att.content : att.content?.toString("base64"),
            path: att.path,
          })),
        }),
      });

      const body = (await response.json()) as { id?: string; message?: string };

      if (!response.ok) {
        Logger.error(`[ResendProvider] Send failed (${response.status}): ${body.message}`);
        return { success: false, error: body.message || `Resend API returned ${response.status}` };
      }

      Logger.info(`[ResendProvider] Email sent: ${body.id}`);
      return { success: true, messageId: body.id };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error("[ResendProvider] Send failed:", error);
      return { success: false, error: errorMessage };
    }
  }

  parseWebhook(body: unknown, _headers: unknown): WebhookEvent | null {
    const payload = body as ResendWebhookPayload;
    const eventType = RESEND_EVENT_MAP[payload?.type];
    const messageId = payload?.data?.email_id;

    if (!eventType || !messageId) {
      Logger.warn(`[ResendProvider] Unhandled or malformed webhook: ${payload?.type}`);
      return null;
    }

    return {
      messageId,
      eventType,
      timestamp: payload.created_at ? new Date(payload.created_at) : new Date(),
      metadata: payload.data,
    };
  }

  // Full cryptographic verification happens in verifyResendWebhookSignature
  // middleware (needs the raw request body + svix-* headers, which this
  // interface's (body, signature) shape can't carry) — see webhookRoutes.ts,
  // mirroring how Meta/Instagram webhooks are already verified in this app.
  verifyWebhookSignature(_body: unknown, _signature: string): boolean {
    return true;
  }
}

// ===================================
// AWS SES IMPLEMENTATION (Future)
// ===================================

export class AWSSESProvider extends BaseEmailProvider {
  constructor() {
    super();
    // TODO: Initialize AWS || SDK
  }

  async sendEmail(_params: SendEmailParams): Promise<SendEmailResult> {
    // TODO: Implement AWS || SES
    throw new Error("AWSSESProvider not implemented yet");
  }

  parseWebhook(_body: unknown, _headers: unknown): WebhookEvent | null {
    // TODO: Implement SNS webhook || parsing
    return null;
  }

  verifyWebhookSignature(_body: unknown, _signature: string): boolean {
    // TODO: Implement SNS signature || verification
    return false;
  }
}

// ===================================
// FACTORY PATTERN
// ===================================

export type EmailProviderType = "nodemailer" | "sendgrid" | "ses" | "resend";

export class EmailProviderFactory {
  static createProvider(
    type?: EmailProviderType,
    config?: ProviderConfig,
    companyId?: string,
  ): IEmailProvider {
    const providerType =
      type || (process.env.EMAIL_PROVIDER as EmailProviderType) || "nodemailer";

    switch (providerType) {
      case "nodemailer":
        return new NodemailerProvider(config as NodemailerConfig, companyId);
      case "sendgrid":
        return new SendGridProvider();
      case "ses":
        return new AWSSESProvider();
      case "resend":
        return new ResendProvider();
      default:
        Logger.warn(
          `[EmailProviderFactory] Unknown provider: ${providerType}, falling back to Nodemailer`,
        );
        return new NodemailerProvider(config as NodemailerConfig, companyId);
    }
  }
}

