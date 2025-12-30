import nodemailer from "nodemailer";
import { AppError } from "@/utils/AppError";

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
      console.warn(
        "SMTP credentials missing. Email service will not send real emails."
      );
    }

    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD, // Support both
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
      console.error(`[EmailService] ❌ ${errorMsg}`);
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
      console.log("Message sent: %s", info.messageId);
    } catch (error: any) {
      console.error("[EmailService] Error sending email:", error);
      // Preserve the original error message from nodemailer
      const errorMsg = error.message || "Failed to send email";
      throw new AppError(`Error SMTP: ${errorMsg}`, 500);
    }
  }
}

export const emailService = new EmailService();
