/**
 * 📊 TIMELINE SERVICE (Refactored — ORM-Free)
 *
 * Unified timeline of all activities (WhatsApp, Email, etc.)
 * All data access delegated to TimelineRepository and EmailRepository.
 */

import {
  TimelineActivity,
  TimelineActivityType,
  GetTimelineParams,
} from "../types/email.types";
import { Logger } from "../utils/logger";
import { timelineRepository } from "@/repositories/TimelineRepository";
import { emailRepository } from "@/repositories/EmailRepository";

export class TimelineService {
  /**
   * Get unified timeline of all activities (WhatsApp, Email, etc.)
   * Sorted by timestamp descending
   */
  async getTimeline(params: GetTimelineParams): Promise<TimelineActivity[]> {
    const {
      contactId,
      ticketId,
      companyId,
      limit = 100,
      offset = 0,
      types,
    } = params;

    try {
      // Parallel fetch for performance
      const [whatsappMessages, emails] = await Promise.all([
        // Fetch WhatsApp messages if needed
        !types || types.includes(TimelineActivityType.WHATSAPP_MESSAGE)
          ? timelineRepository.findWhatsAppMessages({
              contactId,
              ticketId,
              companyId,
              limit,
              offset,
            })
          : [],

        // Fetch Emails if needed
        !types || types.includes(TimelineActivityType.EMAIL)
          ? emailRepository.findForTimeline({
              contactId,
              ticketId,
              companyId,
              limit,
              offset,
            })
          : [],
      ]);

      // Normalize to common interface
      const whatsappActivities: TimelineActivity[] = whatsappMessages.map(
        (msg) => ({
          id: msg.id,
          type: TimelineActivityType.WHATSAPP_MESSAGE,
          timestamp: msg.createdAt,
          direction: (msg.direction || "inbound").toLowerCase() as
            | "inbound"
            | "outbound",
          content: msg.content || "",
          channel: "WHATSAPP" as const,
          status: msg.status || "SENT",
          contactId: contactId,
          ticketId: ticketId,
          metadata: {
            messageId: msg.id,
            hasAttachment: !!msg.metadata?.attachment,
          },
        }),
      );

      const emailActivities: TimelineActivity[] = emails.map((email) => ({
        id: email.id,
        type: TimelineActivityType.EMAIL,
        timestamp: email.createdAt,
        direction: (email.type || "outbound").toLowerCase() as
          | "inbound"
          | "outbound",
        content: email.bodyText || email.bodyHtml || "",
        subject: email.subject,
        channel: "EMAIL" as const,
        status: email.status,
        contactId: email.contactId,
        ticketId: email.ticketId,
        metadata: {
          messageId: email.messageId,
          from: email.from,
          to: email.to,
          hasAttachments: !!email.attachments,
          openedAt: email.openedAt,
          clickedAt: email.clickedAt,
        },
      }));

      // Merge and sort by timestamp descending
      const timeline = [...whatsappActivities, ...emailActivities].sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
      );

      // Apply limit
      return timeline.slice(offset, offset + limit);
    } catch (error: unknown) {
      Logger.error("[TimelineService] Failed to fetch timeline:", error);
      throw error;
    }
  }

  /**
   * Get timeline stats
   */
  async getTimelineStats(contactId: string, companyId: string) {
    const [whatsappCount, emailCount] = await Promise.all([
      timelineRepository.countWhatsAppMessages(contactId, companyId),
      emailRepository.countByContact(contactId, companyId),
    ]);

    return {
      total: whatsappCount + emailCount,
      whatsapp: whatsappCount,
      email: emailCount,
    };
  }
}

// Singleton instance
export const timelineService = new TimelineService();
