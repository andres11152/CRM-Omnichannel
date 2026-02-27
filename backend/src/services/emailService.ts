import nodemailer from "nodemailer";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { decrypt } from "@/utils/encryption";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Check if SMTP credentials are provided
    if (
      !process.env.SMTP_HOST ||
      !process.env.SMTP_PORT ||
      !process.env.SMTP_USER ||
      !(process.env.SMTP_PASS || process.env.SMTP_PASSWORD)
    ) {
      Logger.warn(
        "SMTP credentials missing. Email service will not send real emails.",
      );
    }

    // 🛡️ SECURITY: Decrypt password if encrypted
    let smtpPass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
    if (smtpPass) {
      // Lazy load decryption to avoid circular deps or init issues
      // Note: real implementation might import at top if safe
      try {
        smtpPass = decrypt(smtpPass);
      } catch {
        // Ignore if util not found/fails, assume plaintext
      }
    }

    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: smtpPass,
      },
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    // 🔒 VALIDATION: Check if SMTP is configured before attempting to send
    if (
      !process.env.SMTP_HOST ||
      !process.env.SMTP_USER ||
      !(process.env.SMTP_PASS || process.env.SMTP_PASSWORD)
    ) {
      const errorMsg =
        "SMTP no configurado. Configure las variables SMTP_HOST, SMTP_USER, SMTP_PASS (o SMTP_PASSWORD) en el archivo .env";
      Logger.error(`[EmailService] ❌ ${errorMsg}`);
      throw new AppError(errorMsg, 500);
    }

    try {
      const mailOptions = {
        from:
          options.from ||
          process.env.SMTP_FROM ||
          process.env.SMTP_USER || // Use SMTP_USER as fallback
          '"Reply CRM" <no-reply@replycrm.com>',
        to: options.to,
        subject: options.subject,
        html: options.html,
      };

      const info = await this.transporter.sendMail(mailOptions);
      Logger.info(`Message sent: ${info.messageId}`);
    } catch (error: unknown) {
      Logger.error("[EmailService] Error sending email:", error);
      // Preserve the original error message from nodemailer
      const errorMsg =
        error instanceof Error ? error.message : "Failed to send email";
      throw new AppError(`Error SMTP: ${errorMsg}`, 500);
    }
  }
}

export const emailService = new EmailService();
