import { prisma } from "../config/database";
import {
  TimelineActivity,
  TimelineActivityType,
  GetTimelineParams,
} from "../types/email.types";
import { Logger } from "../utils/logger";

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
          ? this.fetchWhatsAppMessages(
              contactId,
              ticketId,
              companyId,
              limit,
              offset
            )
          : [],

        // Fetch Emails if needed
        !types || types.includes(TimelineActivityType.EMAIL)
          ? this.fetchEmails(contactId, ticketId, companyId, limit, offset)
          : [],
      ]);

      // Normalize to common interface
      const whatsappActivities: TimelineActivity[] = whatsappMessages.map(
        (msg: any) => ({
          id: msg.id,
          type: TimelineActivityType.WHATSAPP_MESSAGE,
          timestamp: msg.createdAt,
          direction: msg.direction?.toLowerCase() as "inbound" | "outbound",
          content: msg.content || "",
          channel: "WHATSAPP" as const,
          status: msg.status || "SENT",
          contactId: contactId,
          ticketId: ticketId,
          metadata: {
            messageId: msg.id,
            hasAttachment: !!msg.metadata?.attachment,
          },
        })
      );

      const emailActivities: TimelineActivity[] = emails.map((email: any) => ({
        id: email.id,
        type: TimelineActivityType.EMAIL,
        timestamp: email.createdAt,
        direction: email.type?.toLowerCase() as "inbound" | "outbound",
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
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      );

      // Apply limit
      return timeline.slice(offset, offset + limit);
    } catch (error: any) {
      Logger.error("[TimelineService] Failed to fetch timeline:", error);
      throw error;
    }
  }

  /**
   * Fetch WhatsApp messages from conversations
   */
  private async fetchWhatsAppMessages(
    contactId: string | undefined,
    ticketId: string | undefined,
    companyId: string,
    limit: number,
    offset: number
  ) {
    // Build where clause
    const where: any = {};

    if (contactId || ticketId) {
      where.conversation = {};

      // Find conversations with this contact or ticket
      if (contactId) {
        // This is a simplification - you might need to join through participants
        where.conversation.participants = {
          some: { id: contactId },
        };
      }

      if (ticketId) {
        where.conversation.tickets = {
          some: { id: ticketId },
        };
      }
    }

    where.conversation = {
      ...where.conversation,
      companyId,
      channel: "WHATSAPP",
    };

    return prisma.message.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        sender: { select: { name: true, email: true } },
        conversation: { select: { id: true, channelId: true } },
      },
    });
  }

  /**
   * Fetch emails
   */
  private async fetchEmails(
    contactId: string | undefined,
    ticketId: string | undefined,
    companyId: string,
    limit: number,
    offset: number
  ) {
    const where: any = { companyId };

    if (contactId) {
      where.contactId = contactId;
    }

    if (ticketId) {
      where.ticketId = ticketId;
    }

    return prisma.email.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        contact: { select: { name: true, email: true } },
        ticket: { select: { ticketNumber: true } },
      },
    });
  }

  /**
   * Get timeline stats
   */
  async getTimelineStats(contactId: string, companyId: string) {
    const [whatsappCount, emailCount] = await Promise.all([
      prisma.message.count({
        where: {
          conversation: {
            participants: { some: { id: contactId } },
            companyId,
            channelId: "WHATSAPP",
          },
        },
      }),
      prisma.email.count({
        where: { contactId, companyId },
      }),
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
