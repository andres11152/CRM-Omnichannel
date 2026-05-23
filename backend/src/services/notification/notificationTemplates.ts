/**
 *  NOTIFICATION TEMPLATES
 * Centralized HTML generation for emails
 */

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

export const NotificationTemplates = {
  quotaWarning: (
    quotaType: string,
    current: number,
    limit: number,
    percentage: number,
    companyName: string,
  ) => `
    <h2>Quota Warning</h2>
    <p>Dear ${companyName} team,</p>
    <p>Your <strong>${quotaType}</strong> usage is approaching the limit:</p>
    <ul>
      <li><strong>Current:</strong> ${current.toLocaleString()}</li>
      <li><strong>Limit:</strong> ${limit.toLocaleString()}</li>
      <li><strong>Usage:</strong> ${percentage}%</li>
    </ul>
    <p>Consider upgrading your plan to avoid service interruption.</p>
    <a href="${FRONTEND_URL}/settings/billing" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
      Upgrade Plan
    </a>
  `,

  quotaExceeded: (quotaType: string, companyName: string) => `
    <h2 style="color: #dc3545;">Quota Exceeded</h2>
    <p>Dear ${companyName} team,</p>
    <p><strong>IMPORTANT:</strong> Your <strong>${quotaType}</strong> has exceeded the plan limit.</p>
    <p>Some features may be temporarily restricted until you upgrade your plan.</p>
    <a href="${FRONTEND_URL}/settings/billing" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
      Upgrade Now
    </a>
  `,

  trialEnding: (daysRemaining: number, companyName: string) => `
    <h2>Trial Period Ending Soon</h2>
    <p>Dear ${companyName} team,</p>
    <p>Your trial period will end in <strong>${daysRemaining} days</strong>.</p>
    <p>To continue using Sentry CRM without interruption, please upgrade to a paid plan.</p>
    <a href="${FRONTEND_URL}/settings/billing" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
      Choose a Plan
    </a>
  `,

  subscriptionExpiring: (expiryDate: Date, companyName: string) => `
    <h2>Subscription Renewal Required</h2>
    <p>Dear ${companyName} team,</p>
    <p>Your subscription will expire on <strong>${expiryDate.toLocaleDateString()}</strong>.</p>
    <p>Please renew your subscription to maintain access to all features.</p>
    <a href="${FRONTEND_URL}/settings/billing" style="background-color: #ff6b6b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
      Renew Subscription
    </a>
  `,

  paymentFailed: (amount: number, reason: string, companyName: string) => `
    <h2 style="color: #dc3545;">Payment Failed</h2>
    <p>Dear ${companyName} team,</p>
    <p>We were unable to process your payment of <strong>$${amount}</strong>.</p>
    <p><strong>Reason:</strong> ${reason}</p>
    <p>Please update your payment method to avoid service interruption.</p>
    <a href="${FRONTEND_URL}/settings/billing" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
      Update Payment Method
    </a>
  `,

  ticketAssigned: (
    ticketId: string,
    assignedToName: string,
    contactName: string,
    subject: string,
    priority: string,
  ) => `
    <h2>New Ticket Assigned to You</h2>
    <p>Hi ${assignedToName},</p>
    <p>A new ticket has been assigned to you:</p>
    <ul>
      <li><strong>Contact:</strong> ${contactName}</li>
      <li><strong>Subject:</strong> ${subject}</li>
      <li><strong>Priority:</strong> ${priority}</li>
    </ul>
    <a href="${FRONTEND_URL}/tickets/${ticketId}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
      View Ticket
    </a>
  `,

  ticketReply: (
    ticketId: string,
    assignedToName: string,
    replyBy: string,
    contactName: string,
  ) => `
    <h2>New Reply on Your Ticket</h2>
    <p>Hi ${assignedToName},</p>
    <p>${replyBy} replied to ticket from ${contactName}.</p>
    <a href="${FRONTEND_URL}/tickets/${ticketId}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
      View Reply
    </a>
  `,

  whatsappDisconnected: (sessionId: string, companyName: string) => `
    <h2 style="color: #ff6b6b;">WhatsApp Session Disconnected</h2>
    <p>Dear ${companyName} team,</p>
    <p>Your WhatsApp session <strong>${sessionId}</strong> has been disconnected.</p>
    <p>Please reconnect to continue receiving and sending messages.</p>
    <a href="${FRONTEND_URL}/settings/whatsapp" style="background-color: #25D366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
      Reconnect WhatsApp
    </a>
  `,

  campaignCompleted: (
    campaignId: string,
    campaignName: string,
    userName: string,
    stats: { total: number; sent: number; failed: number; successRate: string },
  ) => `
    <h2>Campaign Completed</h2>
    <p>Hi ${userName},</p>
    <p>Your campaign <strong>"${campaignName}"</strong> has completed.</p>
    <h3>Results:</h3>
    <ul>
      <li><strong>Total Recipients:</strong> ${stats.total}</li>
      <li><strong>Successfully Sent:</strong> ${stats.sent}</li>
      <li><strong>Failed:</strong> ${stats.failed}</li>
      <li><strong>Success Rate:</strong> ${stats.successRate}%</li>
    </ul>
    <a href="${FRONTEND_URL}/campaigns/${campaignId}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
      View Details
    </a>
  `,

  securityAlert: (alertType: string, details: string, companyName: string) => `
    <h2 style="color: #dc3545;">Security Alert</h2>
    <p>Dear ${companyName} team,</p>
    <p><strong>Alert Type:</strong> ${alertType}</p>
    <p><strong>Details:</strong> ${details}</p>
    <p>Please review your account security settings.</p>
    <a href="${FRONTEND_URL}/settings/security" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
      Review Security
    </a>
  `,

  backupFailed: (backupType: string, error: string, companyName: string) => `
    <h2 style="color: #ff6b6b;">Backup Failed</h2>
    <p>Dear ${companyName} team,</p>
    <p>The scheduled <strong>${backupType}</strong> backup failed.</p>
    <p><strong>Error:</strong> ${error}</p>
    <p>Please contact support if this issue persists.</p>
  `,

  storageWarning: (
    usedMB: string,
    limitMB: string,
    percentage: number,
    companyName: string,
  ) => `
    <h2>Storage Limit Warning</h2>
    <p>Dear ${companyName} team,</p>
    <p>Your storage usage is approaching the limit:</p>
    <ul>
      <li><strong>Used:</strong> ${usedMB} MB</li>
      <li><strong>Limit:</strong> ${limitMB} MB</li>
      <li><strong>Usage:</strong> ${percentage}%</li>
    </ul>
    <p>Consider upgrading your plan or cleaning up old files.</p>
    <a href="${FRONTEND_URL}/settings/billing" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
      Upgrade Storage
    </a>
  `,
};
