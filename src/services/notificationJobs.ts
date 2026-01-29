import { prisma } from "@/config/database";
import { notificationService } from "./notificationService";
import { Logger } from "@/utils/logger";
import TenantContextManager from "@/config/tenantContext";

/**
 * ⏰ SCHEDULED NOTIFICATION JOBS
 * Automatic checks for quotas, expiration, and alerts
 */

export class NotificationJobs {
  /**
   * 💰 Check Billing & Quotas (runs daily)
   */
  async checkBillingAndQuotas() {
    Logger.info("[NotificationJobs] Starting billing and quota checks");

    // 🛡️ SYSTEM MODE: Cron job needs access to all companies
    const companies = await TenantContextManager.runAsSystem(async () =>
      prisma.company.findMany({
        where: {
          status: { in: ["ACTIVE", "TRIAL"] },
        },
        include: {
          plan: true,
        },
      }),
    );

    for (const company of companies) {
      try {
        // Check trial expiration
        if (company.status === "TRIAL" && company.trialEndsAt) {
          await this.checkTrialExpiration(company);
        }

        // Check subscription expiration
        if (company.planExpiresAt) {
          await this.checkSubscriptionExpiration(company);
        }

        // Check quotas
        await this.checkMessageQuota(company);
        await this.checkContactQuota(company);
        await this.checkStorageQuota(company);
      } catch (error) {
        Logger.error(`Failed to check company ${company.id}`, error);
      }
    }

    Logger.info("[NotificationJobs] Billing and quota checks completed");
  }

  /**
   * 🎫 Check Inactive Tickets (runs every 6 hours)
   */
  async checkInactiveTickets() {
    Logger.info("[NotificationJobs] Checking inactive tickets");

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    // 🛡️ SYSTEM MODE: Cron job needs access to all tickets across tenants
    const inactiveTickets = await TenantContextManager.runAsSystem(async () =>
      prisma.ticket.findMany({
        where: {
          status: "OPEN",
          updatedAt: { lt: twoDaysAgo },
        },
        include: {
          assignedTo: true,
        },
      }),
    );

    for (const ticket of inactiveTickets) {
      if (ticket.assignedTo) {
        // Send reminder to agent
        Logger.info(`Sending inactivity reminder for ticket ${ticket.id}`);
      }
    }
  }

  /**
   * 📱 Check WhatsApp Sessions (runs every hour)
   */
  async checkWhatsAppSessions() {
    Logger.info("[NotificationJobs] Checking WhatsApp sessions");

    // 🛡️ SYSTEM MODE: Cron job needs access to all WhatsApp sessions
    const sessions = await TenantContextManager.runAsSystem(async () =>
      prisma.whatsAppSession.findMany({
        where: {
          status: "DISCONNECTED",
          // Only notify once per disconnection
          notifiedAt: null,
        },
      }),
    );

    for (const session of sessions) {
      try {
        await notificationService.sendWhatsAppDisconnected(
          session.companyId,
          session.sessionId,
        );

        // Mark as notified - needs system context too
        await TenantContextManager.runAsSystem(async () =>
          prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { notifiedAt: new Date() },
          }),
        );
      } catch (error) {
        Logger.error(
          `Failed to notify WhatsApp disconnection ${session.id}`,
          error,
        );
      }
    }
  }

  /**
   * 💾 Check Failed Backups (runs daily)
   */
  async checkFailedBackups() {
    Logger.info("[NotificationJobs] Checking failed backups");
    // Integration with backup service
    // This is a placeholder for backup monitoring
  }

  /**
   * ⏰ Private Helper Methods
   */

  private async checkTrialExpiration(company: any) {
    if (!company.trialEndsAt) return;

    const now = new Date();
    const daysRemaining = Math.ceil(
      (company.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Notify at 7, 3, and 1 days remaining
    if ([7, 3, 1].includes(daysRemaining)) {
      await notificationService.sendTrialEnding(company.id, daysRemaining);
    }

    // Trial expired
    if (daysRemaining <= 0) {
      // 🛡️ SYSTEM MODE: Update company status
      await TenantContextManager.runAsSystem(async () =>
        prisma.company.update({
          where: { id: company.id },
          data: { status: "INACTIVE" },
        }),
      );
      await notificationService.sendSubscriptionExpiring(
        company.id,
        company.trialEndsAt,
      );
    }
  }

  private async checkSubscriptionExpiration(company: any) {
    if (!company.planExpiresAt) return;

    const now = new Date();
    const daysRemaining = Math.ceil(
      (company.planExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Notify at 30, 15, 7, 3, and 1 days remaining
    if ([30, 15, 7, 3, 1].includes(daysRemaining)) {
      await notificationService.sendSubscriptionExpiring(
        company.id,
        company.planExpiresAt,
      );
    }

    // Subscription expired
    if (daysRemaining <= 0) {
      // 🛡️ SYSTEM MODE: Update company status
      await TenantContextManager.runAsSystem(async () =>
        prisma.company.update({
          where: { id: company.id },
          data: { status: "OVERDUE" },
        }),
      );
    }
  }

  private async checkMessageQuota(company: any) {
    if (!company.plan) return;

    const planConfig = company.plan.config as any;
    const limit = planConfig?.messageLimit || 1000; // Default 1000 if not set
    if (limit === Infinity) return;

    // Get message count for current month
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );

    // 🛡️ SYSTEM MODE: Count messages for quota check
    const messageCount = await TenantContextManager.runAsSystem(async () =>
      prisma.message.count({
        where: {
          conversation: {
            companyId: company.id,
          },
          createdAt: { gte: startOfMonth },
        },
      }),
    );

    const percentage = (messageCount / limit) * 100;

    // Notify at 80%, 90%, 95%, and 100%
    if (percentage >= 100) {
      await notificationService.sendQuotaExceeded(company.id, "Messages");
    } else if (
      [95, 90, 80].some((threshold) => Math.abs(percentage - threshold) < 1)
    ) {
      await notificationService.sendQuotaWarning(
        company.id,
        "Messages",
        messageCount,
        limit,
        Math.round(percentage),
      );
    }
  }

  private async checkContactQuota(company: any) {
    if (!company.plan) return;

    const limit = company.plan.maxContacts || Infinity;
    if (limit === Infinity) return;

    // 🛡️ SYSTEM MODE: Count contacts for quota check
    const contactCount = await TenantContextManager.runAsSystem(async () =>
      prisma.contact.count({
        where: { companyId: company.id },
      }),
    );

    const percentage = (contactCount / limit) * 100;

    if (percentage >= 100) {
      await notificationService.sendQuotaExceeded(company.id, "Contacts");
    } else if (
      [95, 90, 80].some((threshold) => Math.abs(percentage - threshold) < 1)
    ) {
      await notificationService.sendQuotaWarning(
        company.id,
        "Contacts",
        contactCount,
        limit,
        Math.round(percentage),
      );
    }
  }

  private async checkStorageQuota(company: any) {
    if (!company.plan) return;

    // Convert GB to Bytes (or Infinity)
    const limitGb = company.plan.storageLimitGb || Infinity;
    const limit =
      limitGb === Infinity ? Infinity : limitGb * 1024 * 1024 * 1024;

    if (limit === Infinity) return;

    // Calculate total storage used
    // 🛡️ SYSTEM MODE: Aggregate media size for quota check
    const media = await TenantContextManager.runAsSystem(async () =>
      prisma.media.aggregate({
        where: { companyId: company.id },
        _sum: { size: true },
      }),
    );

    const used = media._sum.size || 0;
    const percentage = (used / limit) * 100;

    if (percentage >= 100) {
      await notificationService.sendQuotaExceeded(company.id, "Storage");
    } else if (
      [95, 90, 80].some((threshold) => Math.abs(percentage - threshold) < 1)
    ) {
      await notificationService.sendStorageWarning(
        company.id,
        used,
        limit,
        Math.round(percentage),
      );
    }
  }
}

export const notificationJobs = new NotificationJobs();
