import { notificationRepository } from "@/repositories/NotificationRepository";
import { userRepository } from "@/repositories/UserRepository";
import { companyRepository } from "@/repositories/CompanyRepository";
import { emailService } from "@/services/email/emailService";
import { Logger } from "@/utils/logger";
import { NotificationAdmin } from "@/types/notification.types";
import { NotificationTemplates } from "./notificationTemplates";
import { CreateEmailDTO } from "@/types/email.types";

/**
 * 📧 NOTIFICATION SERVICE
 * Complete email notification system for SaaS alerts
 */

export class NotificationService {
  /**
   * 💰 BILLING & SUBSCRIPTION NOTIFICATIONS
   */

  async sendQuotaWarning(
    companyId: string,
    quotaType: string,
    current: number,
    limit: number,
    percentage: number,
  ) {
    const company = await this.getCompany(companyId);
    const admins = await this.getCompanyAdmins(companyId);

    const subject = `⚠️ ${quotaType} Quota Warning - ${percentage}% Used`;
    const html = NotificationTemplates.quotaWarning(
      quotaType,
      current,
      limit,
      percentage,
      company.name,
    );

    await this.sendToAdmins(companyId, admins, subject, html);
    Logger.info("Quota warning sent", { companyId, quotaType, percentage });
  }

  async sendQuotaExceeded(companyId: string, quotaType: string) {
    const company = await this.getCompany(companyId);
    const admins = await this.getCompanyAdmins(companyId);

    const subject = `🚫 ${quotaType} Quota Exceeded - Action Required`;
    const html = NotificationTemplates.quotaExceeded(quotaType, company.name);

    await this.sendToAdmins(companyId, admins, subject, html);
    Logger.warn("Quota exceeded notification sent", { companyId, quotaType });
  }

  async sendTrialEnding(companyId: string, daysRemaining: number) {
    const company = await this.getCompany(companyId);
    const admins = await this.getCompanyAdmins(companyId);

    const subject = `⏰ Trial Ending in ${daysRemaining} Days`;
    const html = NotificationTemplates.trialEnding(daysRemaining, company.name);

    await this.sendToAdmins(companyId, admins, subject, html);
    Logger.info("Trial ending notification sent", { companyId, daysRemaining });
  }

  async sendSubscriptionExpiring(companyId: string, expiryDate: Date) {
    const company = await this.getCompany(companyId);
    const admins = await this.getCompanyAdmins(companyId);

    const daysUntilExpiry = Math.ceil(
      (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    const subject = `⚠️ Subscription Expiring in ${daysUntilExpiry} Days`;
    const html = NotificationTemplates.subscriptionExpiring(
      expiryDate,
      company.name,
    );

    await this.sendToAdmins(companyId, admins, subject, html);
    Logger.info("Subscription expiring notification sent", {
      companyId,
      daysUntilExpiry,
    });
  }

  async sendPaymentFailed(companyId: string, amount: number, reason: string) {
    const company = await this.getCompany(companyId);
    const admins = await this.getCompanyAdmins(companyId);

    const subject = `❌ Payment Failed - Action Required`;
    const html = NotificationTemplates.paymentFailed(
      amount,
      reason,
      company.name,
    );

    await this.sendToAdmins(companyId, admins, subject, html);
    Logger.error("Payment failed notification sent", undefined, {
      companyId,
      amount,
      reason,
    });
  }

  /**
   * 🎫 TICKET NOTIFICATIONS
   */

  async sendTicketAssigned(ticketId: string, userId: string) {
    const ticket =
      await notificationRepository.getTicketWithAssigneeAndContact(ticketId);

    if (!ticket || !ticket.assignedTo) return;

    const contactName = ticket.conversation?.contact?.name || "Unknown Contact";
    const assignedName = ticket.assignedTo.name || "Agent";

    const subject = `🎫 New Ticket Assigned: #${ticket.id.substring(0, 8)}`;
    const html = NotificationTemplates.ticketAssigned(
      ticket.id,
      assignedName,
      contactName,
      ticket.subject || "No subject",
      ticket.priority,
    );

    await emailService.sendEmail({
      companyId: ticket.companyId,
      to: [ticket.assignedTo.email],
      from: process.env.DEFAULT_SENDER_EMAIL || "notifications@replycrm.com",
      subject,
      bodyHtml: html,
      ticketId: ticket.id,
    });
    Logger.info("Ticket assigned notification sent", { ticketId, userId });
  }

  async sendTicketReply(ticketId: string, replyBy: string) {
    const ticket =
      await notificationRepository.getTicketWithAssigneeAndContact(ticketId);

    if (!ticket || !ticket.assignedTo) return;
    const contactName = ticket.conversation?.contact?.name || "Unknown Contact";
    const assignedName = ticket.assignedTo.name || "Agent";

    const subject = `💬 New Reply on Ticket #${ticket.id.substring(0, 8)}`;
    const html = NotificationTemplates.ticketReply(
      ticket.id,
      assignedName,
      replyBy,
      contactName,
    );

    await emailService.sendEmail({
      companyId: ticket.companyId,
      to: [ticket.assignedTo.email],
      from: process.env.DEFAULT_SENDER_EMAIL || "notifications@replycrm.com",
      subject,
      bodyHtml: html,
      ticketId: ticket.id,
    });
  }

  /**
   * 📱 WHATSAPP NOTIFICATIONS
   */

  async sendWhatsAppDisconnected(companyId: string, sessionId: string) {
    const company = await this.getCompany(companyId);
    const admins = await this.getCompanyAdmins(companyId);

    const subject = `⚠️ WhatsApp Disconnected - Action Required`;
    const html = NotificationTemplates.whatsappDisconnected(
      sessionId,
      company.name,
    );

    await this.sendToAdmins(companyId, admins, subject, html);
    Logger.warn("WhatsApp disconnected notification sent", {
      companyId,
      sessionId,
    });
  }

  /**
   * 📊 CAMPAIGN NOTIFICATIONS
   */

  async sendCampaignCompleted(
    campaignId: string,
    stats: { sent: number; failed: number; total: number },
  ) {
    const campaign =
      await notificationRepository.getCampaignWithCreator(campaignId);

    if (!campaign || !campaign.createdBy) return;

    const successRate =
      stats.total > 0 ? ((stats.sent / stats.total) * 100).toFixed(1) : "0.0";

    const subject = `✅ Campaign "${campaign.name}" Completed`;
    const html = NotificationTemplates.campaignCompleted(
      campaign.id,
      campaign.name,
      campaign.createdBy.name || "User",
      {
        total: stats.total,
        sent: stats.sent,
        failed: stats.failed,
        successRate,
      },
    );

    await emailService.sendEmail({
      companyId: campaign.companyId,
      to: [campaign.createdBy.email],
      from: process.env.DEFAULT_SENDER_EMAIL || "notifications@replycrm.com",
      subject,
      bodyHtml: html,
    });
    Logger.info("Campaign completed notification sent", { campaignId, stats });
  }

  /**
   * 🔒 SECURITY NOTIFICATIONS
   */

  async sendSecurityAlert(
    companyId: string,
    alertType: string,
    details: string,
  ) {
    const company = await this.getCompany(companyId);
    const admins = await this.getCompanyAdmins(companyId);

    const subject = `🔒 Security Alert: ${alertType}`;
    const html = NotificationTemplates.securityAlert(
      alertType,
      details,
      company.name,
    );

    await this.sendToAdmins(companyId, admins, subject, html);
    Logger.error("Security alert sent", undefined, {
      companyId,
      alertType,
      details,
    });
  }

  /**
   * 💾 BACKUP NOTIFICATIONS
   */

  async sendBackupFailed(companyId: string, backupType: string, error: string) {
    const company = await this.getCompany(companyId);
    const admins = await this.getCompanyAdmins(companyId);

    const subject = `⚠️ Backup Failed: ${backupType}`;
    const html = NotificationTemplates.backupFailed(
      backupType,
      error,
      company.name,
    );

    await this.sendToAdmins(companyId, admins, subject, html);
    Logger.error("Backup failed notification sent", undefined, {
      companyId,
      backupType,
      error,
    });
  }

  /**
   * 📦 STORAGE NOTIFICATIONS
   */

  async sendStorageWarning(
    companyId: string,
    used: number,
    limit: number,
    percentage: number,
  ) {
    const company = await this.getCompany(companyId);
    const admins = await this.getCompanyAdmins(companyId);

    const usedMB = (used / 1024 / 1024).toFixed(2);
    const limitMB = (limit / 1024 / 1024).toFixed(2);

    const subject = `⚠️ Storage Warning - ${percentage}% Used`;
    const html = NotificationTemplates.storageWarning(
      usedMB,
      limitMB,
      percentage,
      company.name,
    );

    await this.sendToAdmins(companyId, admins, subject, html);
    Logger.warn("Storage warning sent", { companyId, percentage });
  }

  /**
   * 🔧 HELPER METHODS
   */

  private async getCompany(companyId: string) {
    const company = await companyRepository.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    if (!company) throw new Error(`Company ${companyId} not found`);
    return company;
  }

  private async getCompanyAdmins(
    companyId: string,
  ): Promise<NotificationAdmin[]> {
    return (await userRepository.findMany({
      where: {
        companyId,
        role: { in: ["ADMIN", "MASTER"] },
      },
      select: { id: true, email: true, name: true },
    })) as NotificationAdmin[];
  }

  private async sendToAdmins(
    companyId: string,
    admins: NotificationAdmin[],
    subject: string,
    html: string,
  ) {
    for (const admin of admins) {
      try {
        // Strictly Typed DTO
        const payload: CreateEmailDTO = {
          companyId,
          to: [admin.email],
          from:
            process.env.DEFAULT_SENDER_EMAIL || "notifications@replycrm.com",
          subject,
          bodyHtml: html,
        };
        await emailService.sendEmail(payload);
      } catch (error: unknown) {
        Logger.error(
          `Failed to send notification to ${admin.email}`,
          error as Error,
        );
      }
    }
  }
}

export const notificationService = new NotificationService();
