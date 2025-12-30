import {
  IEmailProvider,
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
  abstract parseWebhook(body: any, headers: any): WebhookEvent | null;
  abstract verifyWebhookSignature(body: any, signature: string): boolean;
}

// ===================================
// NODEMAILER IMPLEMENTATION
// ===================================

import nodemailer, { Transporter } from "nodemailer";
import { Logger } from "../../utils/logger";

export class NodemailerProvider extends BaseEmailProvider {
  private transporter: Transporter;

  constructor(config?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  }) {
    super();

    if (config) {
      // Multi-Tenant Mode
      this.transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.pass,
        },
      });
      Logger.info(
        "[NodemailerProvider] Initialized with Tenant SMTP:",
        config.host
      );
    } else {
      // Global / System Mode (Fallback)
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });
      Logger.info("[NodemailerProvider] Initialized with System Global SMTP");
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
    } catch (error: any) {
      Logger.error("[NodemailerProvider] Send failed:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  parseWebhook(body: any, headers: any): WebhookEvent | null {
    // Nodemailer doesn't have webhooks by default
    // This would be implemented if using a service like SendGrid/Mailgun
    Logger.warn("[NodemailerProvider] Webhook parsing not supported");
    return null;
  }

  verifyWebhookSignature(body: any, signature: string): boolean {
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

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    // TODO: Implement SendGrid
    throw new Error("SendGridProvider not implemented yet");
  }

  parseWebhook(body: any, headers: any): WebhookEvent | null {
    // TODO: Implement SendGrid webhook parsing
    // Example: https://docs.sendgrid.com/for-developers/tracking-events/event
    return null;
  }

  verifyWebhookSignature(body: any, signature: string): boolean {
    // TODO: Implement SendGrid signature verification
    return false;
  }
}

// ===================================
// AWS SES IMPLEMENTATION (Future)
// ===================================

export class AWSSESProvider extends BaseEmailProvider {
  constructor() {
    super();
    // TODO: Initialize AWS SDK
  }

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    // TODO: Implement AWS SES
    throw new Error("AWSSESProvider not implemented yet");
  }

  parseWebhook(body: any, headers: any): WebhookEvent | null {
    // TODO: Implement SNS webhook parsing
    return null;
  }

  verifyWebhookSignature(body: any, signature: string): boolean {
    // TODO: Implement SNS signature verification
    return false;
  }
}

// ===================================
// FACTORY PATTERN
// ===================================

export type EmailProviderType = "nodemailer" | "sendgrid" | "ses";

export class EmailProviderFactory {
  static createProvider(
    type?: EmailProviderType,
    config?: any
  ): IEmailProvider {
    const providerType =
      type || (process.env.EMAIL_PROVIDER as EmailProviderType) || "nodemailer";

    switch (providerType) {
      case "nodemailer":
        return new NodemailerProvider(config);
      case "sendgrid":
        return new SendGridProvider();
      case "ses":
        return new AWSSESProvider();
      default:
        Logger.warn(
          `[EmailProviderFactory] Unknown provider: ${providerType}, falling back to Nodemailer`
        );
        return new NodemailerProvider(config);
    }
  }
}
