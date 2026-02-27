/**
 * 🏷️ TICKET ENRICHMENT SERVICE
 *
 * Enriches TicketDTOs with:
 * - CRM Contact data (name, avatar, tags)
 * - WhatsApp Session Index mapping (for multi-line accounts)
 */

import { contactRepository } from "@/repositories/ContactRepository";
import { WhatsAppSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { cacheService } from "@/services/cacheService";
import { Logger } from "@/utils/logger";
import type { TicketDTO } from "@/types/ticket.types";

const whatsappSessionRepository = new WhatsAppSessionRepository();

export class TicketEnrichment {
  async enrichWithCrmData(
    dtos: TicketDTO[],
    companyId: string,
  ): Promise<TicketDTO[]> {
    const phonesToFetch = new Set<string>();
    dtos.forEach((t) => {
      if (t.contact.phone) phonesToFetch.add(t.contact.phone);
    });

    let whatsappSessions: {
      id: string;
      phone: string | null;
      sessionId: string;
      defaultQueueId: string | null;
    }[] = [];
    try {
      whatsappSessions = await cacheService.wrap(
        `company:${companyId}:sessions:connected:v1`,
        () =>
          whatsappSessionRepository.findMany({
            where: { companyId, status: "CONNECTED" },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              phone: true,
              sessionId: true,
              defaultQueueId: true,
            },
          }) as Promise<
            {
              id: string;
              phone: string | null;
              sessionId: string;
              defaultQueueId: string | null;
            }[]
          >,
        5,
      );
    } catch (cacheError) {
      Logger.warn(
        "[TicketService] Cache failed, fetching directly:",
        cacheError,
      );
      whatsappSessions = (await whatsappSessionRepository.findMany({
        where: { companyId, status: "CONNECTED" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          phone: true,
          sessionId: true,
          defaultQueueId: true,
        },
      })) as unknown as {
        id: string;
        phone: string | null;
        sessionId: string;
        defaultQueueId: string | null;
      }[];
    }

    const sessionIndexMap = new Map<string, number>();
    const queueToSessionDataMap = new Map<
      string,
      { index: number; phone: string | null }
    >();

    whatsappSessions.forEach((session, index) => {
      const sessionIdx = index + 1;
      if (session.phone) {
        const normalizedPhone = session.phone.replace(/^\+/, "");
        sessionIndexMap.set(normalizedPhone, sessionIdx);
      }
      if (session.defaultQueueId) {
        queueToSessionDataMap.set(session.defaultQueueId, {
          index: sessionIdx,
          phone: session.phone,
        });
      }
    });

    if (phonesToFetch.size === 0 && whatsappSessions.length === 0) return dtos;

    const contacts = await contactRepository.findMany({
      where: {
        companyId,
        phone: { in: Array.from(phonesToFetch) },
      },
      select: {
        id: true,
        phone: true,
        name: true,
        avatarUrl: true,
        tags: true,
      },
    });

    const crmMap = new Map<
      string,
      {
        id: string;
        phone: string | null;
        name: string | null;
        avatarUrl: string | null;
        tags: string[];
      }
    >();
    contacts.forEach((c) => {
      if (c.phone)
        crmMap.set(
          c.phone,
          c as {
            id: string;
            phone: string | null;
            name: string | null;
            avatarUrl: string | null;
            tags: string[];
          },
        );
    });

    return dtos.map((dto) => {
      const crmData = dto.contact.phone
        ? crmMap.get(dto.contact.phone)
        : undefined;
      let whatsappSessionIndex: number | undefined;
      let whatsappSessionPhone: string | undefined;

      if (dto.queueId && queueToSessionDataMap.has(dto.queueId)) {
        const data = queueToSessionDataMap.get(dto.queueId);
        whatsappSessionIndex = data?.index;
        whatsappSessionPhone = data?.phone || undefined;
      }

      if (!whatsappSessionIndex && whatsappSessions.length > 0) {
        if (whatsappSessions.length === 1) {
          whatsappSessionIndex = 1;
          whatsappSessionPhone = whatsappSessions[0].phone || undefined;
        }
      }

      if (crmData) {
        return {
          ...dto,
          tags:
            crmData.tags && crmData.tags.length > 0 ? crmData.tags : dto.tags,
          contact: {
            ...dto.contact,
            realContactId: crmData.id,
            name:
              crmData.name && crmData.name !== dto.contact.phone
                ? crmData.name
                : dto.contact.name,
            avatarUrl: crmData.avatarUrl || dto.contact.avatarUrl,
            whatsappSessionIndex,
            whatsappSessionPhone,
          },
        };
      }

      return {
        ...dto,
        contact: {
          ...dto.contact,
          whatsappSessionIndex,
          whatsappSessionPhone,
        },
      };
    });
  }
}

export const ticketEnrichment = new TicketEnrichment();
