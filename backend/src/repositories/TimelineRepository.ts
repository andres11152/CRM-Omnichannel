/**
 * 📊 TIMELINE REPOSITORY
 *
 * Data access for unified timeline queries:
 * - WhatsApp messages with conversation joins
 * - Message count for timeline stats
 */

import { prisma } from "@/config/database";
import { Prisma } from "@prisma/client";

export class TimelineRepository {
  // ────────────────────────────────────────────────
  // WHATSAPP MESSAGES FOR TIMELINE
  // ────────────────────────────────────────────────

  async findWhatsAppMessages(params: {
    contactId?: string;
    ticketId?: string;
    companyId: string;
    limit: number;
    offset: number;
  }) {
    const where: Prisma.MessageWhereInput = {
      companyId: params.companyId,
      channel: "WHATSAPP",
    };

    if (params.contactId || params.ticketId) {
      where.conversation = {};

      if (params.contactId) {
        where.conversation.participants = {
          some: { id: params.contactId },
        };
      }

      if (params.ticketId) {
        where.conversation.tickets = {
          some: { id: params.ticketId },
        };
      }
    }

    return prisma.message.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: params.limit,
      skip: params.offset,
      include: {
        sender: { select: { name: true, email: true } },
        conversation: { select: { id: true, channelId: true } },
      },
    });
  }

  // ────────────────────────────────────────────────
  // STATS
  // ────────────────────────────────────────────────

  async countWhatsAppMessages(contactId: string, companyId: string) {
    return prisma.message.count({
      where: {
        conversation: {
          participants: { some: { id: contactId } },
          companyId,
          channelId: "WHATSAPP",
        },
      },
    });
  }
}

export const timelineRepository = new TimelineRepository();
