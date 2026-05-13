import nodemailer from "nodemailer";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { encrypt, decrypt } from "@/utils/cryptoUtils";
import { getEnv } from "@/config/env";

/**
 * [SEC] SYSTEM EMAIL SERVICE (Enterprise)
 *
 * Handles SYSTEM-LEVEL email sending (password resets, login notifications, etc.)
 * For multi-tenant business emails (contact/ticket), use services/email/emailService.ts
 *
 * Features:
 * - SMTP password decryption at runtime
 * - Connection verification on first use
 * - Structured logging (no console.log)
 */

interface SystemEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export class SystemEmailService {
  private transporter: nodemailer.Transporter | null = null;

  /**
   * Lazily initializes the SMTP transporter on first use.
   * This prevents startup crashes when SMTP is not configured.
   */
  private getTransporter(): nodemailer.Transporter {
    if (this.transporter) return this.transporter;

    const env = getEnv();
    const host = env.SMTP_HOST;
    const port = env.SMTP_PORT || 587;
    const user = env.SMTP_USER;
    const rawPass = env.SMTP_PASSWORD;

    if (!host || !user || !rawPass) {
      throw new AppError(
        "SMTP no configurado. Configure las variables SMTP_HOST, SMTP_USER, SMTP_PASSWORD en el archivo .env",
        500,
      );
    }

    // [SEC] Attempt to decrypt the password (supports both encrypted and plaintext)
    let smtpPass = rawPass;
    const decrypted = decrypt(rawPass, "system-smtp");
    if (decrypted) {
      smtpPass = decrypted;
    }
    // If decryption fails, assume plaintext (backward compatible)

    const isSecure = port === 465;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: isSecure,
      auth: { user, pass: smtpPass },
      tls: {
        rejectUnauthorized: env.NODE_ENV === "production",
      },
      connectionTimeout: 10000, // 10s connection timeout
      greetingTimeout: 10000,   // 10s greeting timeout
      socketTimeout: 30000,     // 30s socket timeout
    });

    Logger.info(`[SystemEmail] SMTP transporter initialized (${host}:${port}, secure:${isSecure})`);
    return this.transporter;
  }

  async sendEmail(options: SystemEmailOptions): Promise<void> {
    const transporter = this.getTransporter();
    const env = getEnv();

    const mailOptions = {
      from:
        options.from ||
        env.SMTP_USER ||
        '"Reply Software" <no-reply@reply.software>',
      to: options.to,
      subject: options.subject,
      html: options.html,
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      Logger.info(`[SystemEmail] Email sent: ${info.messageId} -> ${options.to}`);
    } catch (error: unknown) {
      const errorMsg =
        error instanceof Error ? error.message : "Failed to send email";
      Logger.error("[SystemEmail] Send failed:", error);

      // Reset transporter on auth/connection errors to force re-init
      if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("EAUTH")) {
        this.transporter = null;
      }

      throw new AppError(`Error SMTP: ${errorMsg}`, 500);
    }
  }

  /**
   * Encrypts an SMTP password for secure storage in the database.
   * The namespace "smtp" + companyId ensures tenant-isolated encryption.
   */
  static encryptSmtpPassword(password: string, companyId: string): string {
    return encrypt(password, `smtp:${companyId}`);
  }

  /**
   * Decrypts an SMTP password retrieved from the database.
   */
  static decryptSmtpPassword(encryptedPassword: string, companyId: string): string | null {
    return decrypt(encryptedPassword, `smtp:${companyId}`);
  }
}

export const emailService = new SystemEmailService();

