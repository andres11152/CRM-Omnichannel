import webpush from "web-push";
import { pushSubscriptionRepository } from "@/repositories/PushSubscriptionRepository";
import { userRepository } from "@/repositories/UserRepository";
import { Logger } from "@/utils/logger";

/**
 *  WEB PUSH NOTIFICATION SERVICE
 * PWA push notifications using Web Push API
 */

// Configure VAPID keys (generate with: web-push generate-vapid-keys)
const vapidKeys = {
  publicKey:
    process.env.VAPID_PUBLIC_KEY ||
    "BNWMhNVrSIdGVkoccDNV4KxchWXpB74JTSKUNQyPJaNcKn1ILi8pSWvexxruUgkoEoKmWnI2UGSpMEgD7wZmabR4",
  privateKey:
    process.env.VAPID_PRIVATE_KEY ||
    "TX8yfc_5VownXWmZfuF63d-JwJ2uLrtkRdl4mNszpeo",
};

try {
  const isPlaceholder =
    vapidKeys.publicKey.includes("BNWMhNVr") ||
    vapidKeys.privateKey.includes("TX8yfc");

  if (!isPlaceholder) {
    webpush.setVapidDetails(
      `mailto:${process.env.SMTP_USER || "noreply@sentrycrm.com"}`,
      vapidKeys.publicKey,
      vapidKeys.privateKey,
    );
  } else {
    // Silently ignore if using placeholders, or log a debug
    Logger.debug("Using placeholder VAPID keys. Web Push disabled.");
  }
} catch (error) {
  // Just log the message, not the stack trace, to keep console clean
  const msg = error instanceof Error ? error.message : String(error);
  Logger.warn(
    `Failed to init Web Push: ${msg}. Push notifications disabled (Check VAPID_PUBLIC/PRIVATE_KEY env vars).`,
  );
}

export interface PushSubscription {
  userId: string;
  companyId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
  tag?: string;
  requireInteraction?: boolean;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
}

class PushNotificationService {
  /**
   * Save push subscription for a user
   */
  async subscribe(subscription: PushSubscription): Promise<void> {
    try {
      await pushSubscriptionRepository.upsert({
        where: {
          userId_endpoint: {
            userId: subscription.userId,
            endpoint: subscription.endpoint,
          },
        },
        create: {
          userId: subscription.userId,
          companyId: subscription.companyId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
        update: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          updatedAt: new Date(),
        },
      });

      Logger.info("Push subscription saved", {
        userId: subscription.userId,
        endpoint: subscription.endpoint.substring(0, 50) + "...",
      });
    } catch (error) {
      Logger.error("Failed to save push subscription", error, {
        userId: subscription.userId,
      });
      throw error;
    }
  }

  /**
   * Remove push subscription
   */
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    try {
      await pushSubscriptionRepository.delete({
        where: {
          userId_endpoint: {
            userId,
            endpoint,
          },
        },
      });

      Logger.info("Push subscription removed", { userId, endpoint });
    } catch (error) {
      Logger.error("Failed to remove push subscription", error, { userId });
    }
  }

  /**
   * Send push notification to a specific user
   */
  async sendToUser(
    userId: string,
    payload: PushNotificationPayload,
  ): Promise<void> {
    try {
      const subscriptions = await pushSubscriptionRepository.findMany({
        where: { userId },
      });

      if (subscriptions.length === 0) {
        Logger.debug("No push subscriptions found for user", { userId });
        return;
      }

      const results = await Promise.allSettled(
        subscriptions.map((sub) =>
          this.sendPushNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            payload,
          ),
        ),
      );

      const sent = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      Logger.info("Push notifications sent to user", {
        userId,
        sent,
        failed,
        total: subscriptions.length,
      });

      // Clean up expired subscriptions
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === "rejected") {
          const error = (results[i] as PromiseRejectedResult).reason;
          if (error?.statusCode === 410 || error?.statusCode === 404) {
            // Subscription expired
            await this.unsubscribe(userId, subscriptions[i].endpoint);
          }
        }
      }
    } catch (error) {
      Logger.error("Failed to send push to user", error, { userId });
    }
  }

  /**
   * Send push notification to all users in a company
   */
  async sendToCompany(
    companyId: string,
    payload: PushNotificationPayload,
  ): Promise<void> {
    try {
      const subscriptions = await pushSubscriptionRepository.findMany({
        where: { companyId },
      });

      if (subscriptions.length === 0) {
        Logger.debug("No push subscriptions found for company", { companyId });
        return;
      }

      const results = await Promise.allSettled(
        subscriptions.map((sub) =>
          this.sendPushNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            payload,
          ),
        ),
      );

      const sent = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      Logger.info("Push notifications sent to company", {
        companyId,
        sent,
        failed,
        total: subscriptions.length,
      });
    } catch (error) {
      Logger.error("Failed to send push to company", error, { companyId });
    }
  }

  /**
   * Send push notification to specific users (e.g., all admins)
   */
  async sendToUsers(
    userIds: string[],
    payload: PushNotificationPayload,
  ): Promise<void> {
    try {
      const subscriptions = await pushSubscriptionRepository.findMany({
        where: {
          userId: { in: userIds },
        },
      });

      if (subscriptions.length === 0) {
        Logger.debug("No push subscriptions found for users", { userIds });
        return;
      }

      await Promise.allSettled(
        subscriptions.map((sub) =>
          this.sendPushNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            payload,
          ),
        ),
      );

      Logger.info("Push notifications sent to users", {
        userCount: userIds.length,
        subscriptions: subscriptions.length,
      });
    } catch (error) {
      Logger.error("Failed to send push to users", error);
    }
  }

  /**
   * Low-level: Send push notification to a subscription
   */
  private async sendPushNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: PushNotificationPayload,
  ): Promise<void> {
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    };

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || "/icon-192x192.png",
      badge: payload.badge || "/badge-72x72.png",
      data: payload.data || {},
      tag: payload.tag,
      requireInteraction: payload.requireInteraction || false,
      actions: payload.actions || [],
      timestamp: Date.now(),
    });

    await webpush.sendNotification(pushSubscription, notificationPayload);
  }

  /**
   * Get VAPID public key for frontend
   */
  getPublicKey(): string {
    return vapidKeys.publicKey;
  }

  /**
   *  NOTIFICATION TEMPLATES
   */

  /**
   * New message notification
   */
  async notifyNewMessage(
    userId: string,
    from: string,
    preview: string,
  ): Promise<void> {
    await this.sendToUser(userId, {
      title: `New message from ${from}`,
      body: preview,
      icon: "/icon-192x192.png",
      badge: "/badge-72x72.png",
      tag: "new-message",
      data: {
        type: "message",
        from,
      },
      actions: [
        { action: "view", title: "View" },
        { action: "reply", title: "Reply" },
      ],
    });
  }

  /**
   * Ticket assigned notification
   */
  async notifyTicketAssigned(
    userId: string,
    ticketId: string,
    subject: string,
  ): Promise<void> {
    await this.sendToUser(userId, {
      title: " New Ticket Assigned",
      body: subject,
      icon: "/icon-192x192.png",
      tag: "ticket-assigned",
      data: {
        type: "ticket",
        ticketId,
      },
      actions: [{ action: "view", title: "View Ticket" }],
    });
  }

  /**
   * Quota warning notification
   */
  async notifyQuotaWarning(
    companyId: string,
    quotaType: string,
    percentage: number,
  ): Promise<void> {
    const admins = await userRepository.findMany({
      where: {
        companyId,
        role: { in: ["ADMIN", "MASTER"] },
      },
      select: { id: true },
    });

    await this.sendToUsers(
      admins.map((a) => a.id),
      {
        title: `[WARNING] ${quotaType} Quota Warning`,
        body: `You've used ${percentage}% of your ${quotaType} quota`,
        icon: "/icon-192x192.png",
        badge: "/badge-72x72.png",
        tag: "quota-warning",
        requireInteraction: true,
        data: {
          type: "quota",
          quotaType,
          percentage,
        },
        actions: [{ action: "upgrade", title: "Upgrade Plan" }],
      },
    );
  }

  /**
   * WhatsApp disconnected notification
   */
  async notifyWhatsAppDisconnected(
    companyId: string,
    sessionId: string,
  ): Promise<void> {
    const admins = await userRepository.findMany({
      where: {
        companyId,
        role: { in: ["ADMIN", "MASTER"] },
      },
      select: { id: true },
    });

    await this.sendToUsers(
      admins.map((a) => a.id),
      {
        title: "[WARNING] WhatsApp Disconnected",
        body: "Your WhatsApp session has been disconnected. Reconnect to continue.",
        icon: "/icon-192x192.png",
        tag: "whatsapp-disconnected",
        requireInteraction: true,
        data: {
          type: "whatsapp",
          sessionId,
        },
        actions: [{ action: "reconnect", title: "Reconnect" }],
      },
    );
  }

  /**
   * Campaign completed notification
   */
  async notifyCampaignCompleted(
    userId: string,
    campaignName: string,
    stats: { sent: number; total: number },
  ): Promise<void> {
    const successRate = ((stats.sent / stats.total) * 100).toFixed(1);

    await this.sendToUser(userId, {
      title: "[OK] Campaign Completed",
      body: `"${campaignName}" sent to ${stats.sent}/${stats.total} (${successRate}%)`,
      icon: "/icon-192x192.png",
      tag: "campaign-completed",
      data: {
        type: "campaign",
        campaignName,
        stats,
      },
      actions: [{ action: "view", title: "View Results" }],
    });
  }
}

export const pushNotificationService = new PushNotificationService();
export { webpush };
