/**
 * 📧 EMAIL REPOSITORY
 *
 * Data access for Email model + Company SMTP config:
 * - CRUD for emails (create, find, update status)
 * - Company SMTP configuration lookup
 * - Contact auto-creation for inbound emails
 */

import { prisma } from "@/config/database";
import { Prisma } from "@prisma/client";

export class EmailRepository {
  // ────────────────────────────────────────────────
  // EMAIL CRUD
  // ────────────────────────────────────────────────

  async create(data: Prisma.EmailCreateInput, include?: Prisma.EmailInclude) {
    return prisma.email.create({ data, include });
  }

  async findUnique(args: Prisma.EmailFindUniqueArgs) {
    return prisma.email.findUnique(args);
  }

  async findByMessageId(messageId: string) {
    return prisma.email.findUnique({ where: { messageId } });
  }

  async update(id: string, data: Prisma.EmailUpdateInput) {
    return prisma.email.update({ where: { id }, data });
  }

  async findByContact(contactId: string, companyId: string, limit = 50) {
    return prisma.email.findMany({
      where: { contactId, companyId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async findByTicket(ticketId: string, companyId: string) {
    return prisma.email.findMany({
      where: { ticketId, companyId },
      orderBy: { createdAt: "desc" },
    });
  }

  async countByContact(contactId: string, companyId: string) {
    return prisma.email.count({
      where: { contactId, companyId },
    });
  }

  // ────────────────────────────────────────────────
  // TIMELINE QUERIES (used by TimelineService)
  // ────────────────────────────────────────────────

  async findForTimeline(params: {
    contactId?: string;
    ticketId?: string;
    companyId: string;
    limit: number;
    offset: number;
  }) {
    const where: Prisma.EmailWhereInput = {
      companyId: params.companyId,
    };
    if (params.contactId) where.contactId = params.contactId;
    if (params.ticketId) where.ticketId = params.ticketId;

    return prisma.email.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: params.limit,
      skip: params.offset,
      include: {
        contact: { select: { name: true, email: true } },
        ticket: { select: { ticketNumber: true } },
      },
    });
  }

  // ────────────────────────────────────────────────
  // COMPANY SMTP CONFIG
  // ────────────────────────────────────────────────

  async findCompanySmtpConfig(companyId: string) {
    return prisma.company.findUnique({
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
  }

  // ────────────────────────────────────────────────
  // CONTACT AUTO-CREATION (Inbound emails)
  // ────────────────────────────────────────────────

  async findContactByEmail(companyId: string, email: string) {
    return prisma.contact.findFirst({
      where: { companyId, email },
    });
  }

  async createContact(data: {
    companyId: string;
    email: string;
    name: string;
  }) {
    return prisma.contact.create({ data });
  }
}

export const emailRepository = new EmailRepository();
