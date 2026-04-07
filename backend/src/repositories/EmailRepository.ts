/**
 *  EMAIL REPOSITORY
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

  async create(
    companyId: string,
    data: Prisma.EmailCreateInput,
    include?: Prisma.EmailInclude,
  ) {
    if (data.company?.connect?.id !== companyId) {
      data.company = { connect: { id: companyId } };
    }
    return prisma.email.create({ data, include });
  }

  async findUnique(
    companyId: string,
    args: Omit<Prisma.EmailFindUniqueArgs, "where"> & {
      where: Prisma.EmailWhereUniqueInput;
    },
  ) {
    return prisma.email.findFirst({
      ...args,
      where: { ...args.where, companyId },
    });
  }

  async findByMessageId(companyId: string, messageId: string) {
    return prisma.email.findFirst({ where: { companyId, messageId } });
  }

  async findByMessageIdSystem(messageId: string) {
    return prisma.email.findFirst({ where: { messageId } });
  }

  async update(companyId: string, id: string, data: Prisma.EmailUpdateInput) {
    const res = await prisma.email.updateMany({
      where: { companyId, id },
      data,
    });
    if (res.count > 0) {
      return prisma.email.findUnique({ where: { id } });
    }
    return null;
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
