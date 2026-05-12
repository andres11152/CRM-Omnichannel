import {
  IEmailProvider,
  NodemailerConfig,
  ProviderConfig,
  SendEmailParams,
  SendEmailResult,
  WebhookEvent,
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

export type EmailProviderType = "nodemailer" | "sendgrid" | "ses";

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
      default:
        Logger.warn(
          `[EmailProviderFactory] Unknown provider: ${providerType}, falling back to Nodemailer`,
        );
        return new NodemailerProvider(config as NodemailerConfig, companyId);
    }
  }
}

