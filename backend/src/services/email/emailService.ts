import { prisma } from "../../config/database";
import { EmailStatus, EmailType, Prisma } from "@prisma/client";
import {
  CreateEmailDTO,
  UpdateEmailStatusDTO,
  IEmailProvider,
  WebhookEventType,
} from "../../types/email.types";
import { EmailProviderFactory } from "./email.provider";
import { Logger } from "../../utils/logger";
import { AppError } from "../../utils/AppError";
import { CircuitBreaker } from "../../utils/resilience";

// Helper to strip undefined values for JSON B storage
const sanitizeForJson = (data: unknown): Prisma.InputJsonValue => {
  return JSON.parse(JSON.stringify(data));
};

export class EmailService {
  private provider: IEmailProvider;
  private smtpBreaker: CircuitBreaker;

  constructor(provider?: IEmailProvider) {
    // Default system provider (fallback)
    this.provider = provider || EmailProviderFactory.createProvider();

    // 🛡️ Circuit Breaker for SMTP operations
    this.smtpBreaker = new CircuitBreaker({
      threshold: 5,
      timeout: 60000, // 1 minute
      name: "SMTP",
    });
  }

  /**
   * Get provider for a specific company (Multi-Tenant)
   */
  private async getProviderForCompany(
    companyId: string,
  ): Promise<IEmailProvider> {
    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          emailProvider: true,
          smtpHost: true,
          smtpPort: true,
          smtpUser: true,
          smtpPassword: true,
          smtpSecure: true,
        },
      });

      // If company has Custom SMTP configured, use it
      if (
        company &&
        company.smtpHost &&
        company.smtpUser &&
        company.emailProvider === "SMTP"
      ) {
        Logger.info(
          `[EmailService] Using Custom SMTP for Company: ${companyId}`,
        );
        return EmailProviderFactory.createProvider("nodemailer", {
          host: company.smtpHost,
          port: company.smtpPort || 587,
          user: company.smtpUser,
          pass: company.smtpPassword, // In production, decrypt this!
          secure: company.smtpSecure ?? true,
        });
      }

      // Fallback to System Global Provider
      return this.provider;
    } catch (error) {
      Logger.error(
        `[EmailService] Error fetching company config, using default provider`,
        error as Error,
      );
      return this.provider;
    }
  }

  /**
   * Send and save an email
   */
  async sendEmail(dto: CreateEmailDTO) {
    try {
      const currentProvider = await this.getProviderForCompany(dto.companyId);

      Logger.info("[EmailService] Sending email:", {
        from: dto.from,
        to: dto.to,
        subject: dto.subject,
        provider: currentProvider.constructor.name,
      });

      // 1. Send via provider with Circuit Breaker protection
      const result = await this.smtpBreaker.execute(async () => {
        return await currentProvider.sendEmail({
          from: dto.from,
          to: dto.to,
          cc: dto.cc,
          bcc: dto.bcc,
          subject: dto.subject,
          htmlBody: dto.bodyHtml,
          textBody: dto.bodyText,
          replyTo: dto.replyTo,
          attachments: dto.attachments,
          enableTracking: dto.enableTracking,
        });
      });

      if (!result.success) {
        const errorMsg = result.error || "Unknown error";
        throw new AppError(`Failed to send email: ${errorMsg}`, 500);
      }

      // 2. Save to database
      const email = await prisma.email.create({
        data: {
          companyId: dto.companyId,
          messageId: result.messageId,
          from: dto.from,
          to: dto.to,
          cc: dto.cc || [],
          bcc: dto.bcc || [],
          subject: dto.subject,
          bodyHtml: dto.bodyHtml,
          bodyText: dto.bodyText,
          replyTo: dto.replyTo,
          type: EmailType.OUTBOUND,
          status: EmailStatus.SENT,
          contactId: dto.contactId,
          ticketId: dto.ticketId,
          attachments: dto.attachments
            ? (sanitizeForJson(dto.attachments) as Prisma.InputJsonValue)
            : undefined,
          sentAt: new Date(),
        },
        include: {
          contact: { select: { name: true, email: true } },
          ticket: { select: { ticketNumber: true } },
        },
      });

      Logger.info(`[EmailService] Email saved to DB: ${email.id}`);

      return email;
    } catch (error) {
      Logger.error("[EmailService] Send failed:", error as Error);
      throw error;
    }
  }

  /**
   * Save an incoming email (from webhook or IMAP)
   */
  async saveInboundEmail(
    dto: Omit<CreateEmailDTO, "companyId"> & {
      companyId: string;
      messageId?: string;
    },
  ) {
    try {
      // Find or create contact by email
      let contact = null;
      const senderEmail = dto.from;

      if (senderEmail) {
        contact = await prisma.contact.findFirst({
          where: {
            companyId: dto.companyId,
            email: senderEmail,
          },
        });

        // Auto-create contact if not exists
        if (!contact) {
          contact = await prisma.contact.create({
            data: {
              companyId: dto.companyId,
              email: senderEmail,
              name: senderEmail.split("@")[0], // Use email prefix as name
            },
          });
          Logger.info(`[EmailService] Auto-created contact: ${contact.id}`);
        }
      }

      // Save email
      const email = await prisma.email.create({
        data: {
          companyId: dto.companyId,
          messageId: dto.messageId,
          from: dto.from,
          to: dto.to,
          cc: dto.cc || [],
          bcc: dto.bcc || [],
          subject: dto.subject,
          bodyHtml: dto.bodyHtml,
          bodyText: dto.bodyText,
          type: EmailType.INBOUND,
          status: EmailStatus.DELIVERED,
          contactId: contact?.id,
          ticketId: dto.ticketId,
          attachments: dto.attachments
            ? (sanitizeForJson(dto.attachments) as Prisma.InputJsonValue)
            : undefined,
        },
        include: {
          contact: { select: { name: true, email: true } },
        },
      });

      Logger.info(`[EmailService] Inbound email saved: ${email.id}`);

      return email;
    } catch (error) {
      Logger.error(
        "[EmailService] Failed to save inbound email:",
        error as Error,
      );
      throw error;
    }
  }

  /**
   * Update email status from webhook
   */
  async updateEmailStatus(dto: UpdateEmailStatusDTO) {
    try {
      const email = await prisma.email.findUnique({
        where: { messageId: dto.messageId },
      });

      if (!email) {
        Logger.warn(
          `[EmailService] Email not found for messageId: ${dto.messageId}`,
        );
        return null;
      }

      const updated = await prisma.email.update({
        where: { id: email.id },
        data: {
          status: dto.status,
          errorMessage: dto.errorMessage,
          openedAt: dto.openedAt,
          clickedAt: dto.clickedAt,
        },
      });

      Logger.info(
        `[EmailService] Status updated: ${updated.id} -> ${dto.status}`,
      );

      return updated;
    } catch (error) {
      Logger.error("[EmailService] Failed to update status:", error as Error);
      throw error;
    }
  }

  /**
   * Get emails by contact
   */
  async getEmailsByContact(contactId: string, companyId: string) {
    return prisma.email.findMany({
      where: {
        contactId,
        companyId,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  /**
   * Get emails by ticket
   */
  async getEmailsByTicket(ticketId: string, companyId: string) {
    return prisma.email.findMany({
      where: {
        ticketId,
        companyId,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Process webhook from email provider
   */
  async processWebhook(body: unknown, headers: unknown) {
    try {
      const event = this.provider.parseWebhook(body, headers);

      if (!event) {
        Logger.warn("[EmailService] Webhook parsing failed");
        return null;
      }

      // Map webhook event to email status
      const statusMap: Record<WebhookEventType, EmailStatus> = {
        [WebhookEventType.DELIVERED]: EmailStatus.DELIVERED,
        [WebhookEventType.OPENED]: EmailStatus.OPENED,
        [WebhookEventType.CLICKED]: EmailStatus.CLICKED,
        [WebhookEventType.BOUNCED]: EmailStatus.BOUNCED,
        [WebhookEventType.SPAM]: EmailStatus.SPAM,
        [WebhookEventType.FAILED]: EmailStatus.FAILED,
      };

      const status = statusMap[event.eventType] || EmailStatus.SENT;

      return this.updateEmailStatus({
        messageId: event.messageId,
        status,
        openedAt:
          event.eventType === WebhookEventType.OPENED
            ? event.timestamp
            : undefined,
        clickedAt:
          event.eventType === WebhookEventType.CLICKED
            ? event.timestamp
            : undefined,
      });
    } catch (error) {
      Logger.error("[EmailService] Webhook processing failed:", error as Error);
      throw error;
    }
  }
}

// Singleton instance
export const emailService = new EmailService();
