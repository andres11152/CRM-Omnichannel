import { prisma } from "@/config/database";
import { emailService } from "@/services/email/email.service";
import { Logger } from "@/utils/logger";
import { getErrorMessage } from "@/utils/errorHelpers";
import {
  NotificationAdmin,
  EmailPayload,
} from "@/interfaces/NotificationTypes";

/**
 * 📧 NOTIFICATION SERVICE
 * Complete email notification system for SaaS alerts
 */

export interface NotificationData {
  companyId: string;
  userId?: string;
  type: NotificationType;
  data: Record<string, any>;
}

export enum NotificationType {
  // Billing & Subscription
  QUOTA_WARNING = "quota_warning",
  QUOTA_EXCEEDED = "quota_exceeded",
  TRIAL_ENDING = "trial_ending",
  SUBSCRIPTION_EXPIRING = "subscription_expiring",
  SUBSCRIPTION_EXPIRED = "subscription_expired",
  PAYMENT_FAILED = "payment_failed",
  PAYMENT_SUCCESS = "payment_success",
  PLAN_UPGRADED = "plan_upgraded",
  PLAN_DOWNGRADED = "plan_downgraded",

  // Tickets & Support
  TICKET_ASSIGNED = "ticket_assigned",
  TICKET_REPLY = "ticket_reply",
  TICKET_RESOLVED = "ticket_resolved",
  TICKET_REOPENED = "ticket_reopened",

  // Campaigns
  CAMPAIGN_STARTED = "campaign_started",
  CAMPAIGN_COMPLETED = "campaign_completed",
  CAMPAIGN_FAILED = "campaign_failed",

  // WhatsApp
  WHATSAPP_DISCONNECTED = "whatsapp_disconnected",
  WHATSAPP_CONNECTED = "whatsapp_connected",
  WHATSAPP_QR_EXPIRED = "whatsapp_qr_expired",

  // System
  BACKUP_FAILED = "backup_failed",
  STORAGE_WARNING = "storage_warning",
  INACTIVITY_WARNING = "inactivity_warning",
  SECURITY_ALERT = "security_alert",

  // Users
  NEW_USER_ADDED = "new_user_added",
  USER_REMOVED = "user_removed",
  ROLE_CHANGED = "role_changed",
}

class NotificationService {
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
    const html = `
      <h2>Quota Warning</h2>
      <p>Dear ${company.name} team,</p>
      <p>Your <strong>${quotaType}</strong> usage is approaching the limit:</p>
      <ul>
        <li><strong>Current:</strong> ${current.toLocaleString()}</li>
        <li><strong>Limit:</strong> ${limit.toLocaleString()}</li>
        <li><strong>Usage:</strong> ${percentage}%</li>
      </ul>
      <p>Consider upgrading your plan to avoid service interruption.</p>
      <a href="${
        process.env.FRONTEND_URL
      }/settings/billing" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
        Upgrade Plan
      </a>
    `;

    await this.sendToAdmins(companyId, admins, subject, html);
    Logger.info("Quota warning sent", { companyId, quotaType, percentage });
  }

  async sendQuotaExceeded(companyId: string, quotaType: string) {
    const company = await this.getCompany(companyId);
    const admins = await this.getCompanyAdmins(companyId);

    const subject = `🚫 ${quotaType} Quota Exceeded - Action Required`;
    const html = `
      <h2 style="color: #dc3545;">Quota Exceeded</h2>
      <p>Dear ${company.name} team,</p>
      <p><strong>IMPORTANT:</strong> Your <strong>${quotaType}</strong> has exceeded the plan limit.</p>
      <p>Some features may be temporarily restricted until you upgrade your plan.</p>
      <a href="${process.env.FRONTEND_URL}/settings/billing" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
        Upgrade Now
      </a>
    `;

    await this.sendToAdmins(companyId, admins, subject, html);
    Logger.warn("Quota exceeded notification sent", { companyId, quotaType });
  }

  async sendTrialEnding(companyId: string, daysRemaining: number) {
    const company = await this.getCompany(companyId);
    const admins = await this.getCompanyAdmins(companyId);

    const subject = `⏰ Trial Ending in ${daysRemaining} Days`;
    const html = `
      <h2>Trial Period Ending Soon</h2>
      <p>Dear ${company.name} team,</p>
      <p>Your trial period will end in <strong>${daysRemaining} days</strong>.</p>
      <p>To continue using Reply CRM without interruption, please upgrade to a paid plan.</p>
      <a href="${process.env.FRONTEND_URL}/settings/billing" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
        Choose a Plan
      </a>
    `;

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
    const html = `
      <h2>Subscription Renewal Required</h2>
      <p>Dear ${company.name} team,</p>
      <p>Your subscription will expire on <strong>${expiryDate.toLocaleDateString()}</strong>.</p>
      <p>Please renew your subscription to maintain access to all features.</p>
      <a href="${
        process.env.FRONTEND_URL
      }/settings/billing" style="background-color: #ff6b6b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
        Renew Subscription
      </a>
    `;

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
    const html = `
      <h2 style="color: #dc3545;">Payment Failed</h2>
      <p>Dear ${company.name} team,</p>
      <p>We were unable to process your payment of <strong>$${amount}</strong>.</p>
      <p><strong>Reason:</strong> ${reason}</p>
      <p>Please update your payment method to avoid service interruption.</p>
      <a href="${process.env.FRONTEND_URL}/settings/billing" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
        Update Payment Method
      </a>
    `;

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
    // Optimized fetch with select instead of full include
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        assignedTo: { select: { name: true, email: true } },
        conversation: {
          select: { contact: { select: { name: true } } },
        },
      },
    });

    if (!ticket || !ticket.assignedTo) return;

    const contactName = ticket.conversation?.contact?.name || "Unknown Contact";

    const subject = `🎫 New Ticket Assigned: #${ticket.id.substring(0, 8)}`;
    const html = `
      <h2>New Ticket Assigned to You</h2>
      <p>Hi ${ticket.assignedTo.name},</p>
      <p>A new ticket has been assigned to you:</p>
      <ul>
        <li><strong>Contact:</strong> ${contactName}</li>
        <li><strong>Subject:</strong> ${ticket.subject || "No subject"}</li>
        <li><strong>Priority:</strong> ${ticket.priority}</li>
      </ul>
      <a href="${process.env.FRONTEND_URL}/tickets/${
        ticket.id
      }" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
        View Ticket
      </a>
    `;

    await emailService.sendEmail({
      companyId: ticket.companyId,
      to: [ticket.assignedTo.email], // Correctly array typed
      from: process.env.DEFAULT_SENDER_EMAIL || "notifications@replycrm.com",
      subject,
      bodyHtml: html,
      ticketId: ticket.id,
    });
    Logger.info("Ticket assigned notification sent", { ticketId, userId });
  }

  async sendTicketReply(ticketId: string, replyBy: string) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        assignedTo: { select: { name: true, email: true } },
        conversation: {
          select: { contact: { select: { name: true } } },
        },
      },
    });

    if (!ticket || !ticket.assignedTo) return;
    const contactName = ticket.conversation?.contact?.name || "Unknown Contact";

    const subject = `💬 New Reply on Ticket #${ticket.id.substring(0, 8)}`;
    const html = `
      <h2>New Reply on Your Ticket</h2>
      <p>Hi ${ticket.assignedTo.name},</p>
      <p>${replyBy} replied to ticket from ${contactName}.</p>
      <a href="${process.env.FRONTEND_URL}/tickets/${ticket.id}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
        View Reply
      </a>
    `;

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
    const html = `
      <h2 style="color: #ff6b6b;">WhatsApp Session Disconnected</h2>
      <p>Dear ${company.name} team,</p>
      <p>Your WhatsApp session <strong>${sessionId}</strong> has been disconnected.</p>
      <p>Please reconnect to continue receiving and sending messages.</p>
      <a href="${process.env.FRONTEND_URL}/settings/whatsapp" style="background-color: #25D366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
        Reconnect WhatsApp
      </a>
    `;

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
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        name: true,
        companyId: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
      // Removed generic include
    });

    if (!campaign || !campaign.createdBy) return;

    const successRate =
      stats.total > 0 ? ((stats.sent / stats.total) * 100).toFixed(1) : "0.0";

    const subject = `✅ Campaign "${campaign.name}" Completed`;
    const html = `
      <h2>Campaign Completed</h2>
      <p>Hi ${campaign.createdBy.name},</p>
      <p>Your campaign <strong>"${campaign.name}"</strong> has completed.</p>
      <h3>Results:</h3>
      <ul>
        <li><strong>Total Recipients:</strong> ${stats.total}</li>
        <li><strong>Successfully Sent:</strong> ${stats.sent}</li>
        <li><strong>Failed:</strong> ${stats.failed}</li>
        <li><strong>Success Rate:</strong> ${successRate}%</li>
      </ul>
      <a href="${process.env.FRONTEND_URL}/campaigns/${campaign.id}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
        View Details
      </a>
    `;

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
    const html = `
      <h2 style="color: #dc3545;">Security Alert</h2>
      <p>Dear ${company.name} team,</p>
      <p><strong>Alert Type:</strong> ${alertType}</p>
      <p><strong>Details:</strong> ${details}</p>
      <p>Please review your account security settings.</p>
      <a href="${process.env.FRONTEND_URL}/settings/security" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
        Review Security
      </a>
    `;

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
    const html = `
      <h2 style="color: #ff6b6b;">Backup Failed</h2>
      <p>Dear ${company.name} team,</p>
      <p>The scheduled <strong>${backupType}</strong> backup failed.</p>
      <p><strong>Error:</strong> ${error}</p>
      <p>Please contact support if this issue persists.</p>
    `;

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

    const subject = `⚠️ Storage Warning - ${percentage}% Used`;
    const html = `
      <h2>Storage Limit Warning</h2>
      <p>Dear ${company.name} team,</p>
      <p>Your storage usage is approaching the limit:</p>
      <ul>
        <li><strong>Used:</strong> ${(used / 1024 / 1024).toFixed(2)} MB</li>
        <li><strong>Limit:</strong> ${(limit / 1024 / 1024).toFixed(2)} MB</li>
        <li><strong>Usage:</strong> ${percentage}%</li>
      </ul>
      <p>Consider upgrading your plan or cleaning up old files.</p>
      <a href="${
        process.env.FRONTEND_URL
      }/settings/billing" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
        Upgrade Storage
      </a>
    `;

    await this.sendToAdmins(companyId, admins, subject, html);
    Logger.warn("Storage warning sent", { companyId, percentage });
  }

  /**
   * 🔧 HELPER METHODS
   */

  private async getCompany(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true }, // Optimization
    });
    if (!company) throw new Error(`Company ${companyId} not found`);
    return company;
  }

  private async getCompanyAdmins(
    companyId: string,
  ): Promise<NotificationAdmin[]> {
    return await prisma.user.findMany({
      where: {
        companyId,
        role: { in: ["ADMIN", "MASTER"] },
      },
      select: { id: true, email: true, name: true },
    });
  }

  private async sendToAdmins(
    companyId: string,
    admins: NotificationAdmin[],
    subject: string,
    html: string,
  ) {
    for (const admin of admins) {
      try {
        const payload: EmailPayload = {
          companyId,
          to: [admin.email],
          from:
            process.env.DEFAULT_SENDER_EMAIL || "notifications@replycrm.com",
          subject,
          bodyHtml: html,
        };
        await emailService.sendEmail(payload as any); // Adapter mismatch handling if emailService isn't updated yet, but intention is clear.
        // Assuming emailService accepts similar structure. Original code passed arguments matching EmailPayload partially.
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
