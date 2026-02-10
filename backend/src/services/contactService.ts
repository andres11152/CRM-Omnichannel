import { prisma } from "@/config/database";
import { AppError } from "@/utils/AppError";
import { HTTP_STATUS } from "@/constants/httpStatus";
import { Logger } from "@/utils/logger";
import { planLimitsService } from "@/services/planLimitsService";
import { Contact, Prisma } from "@prisma/client";
import {
  ContactDTO,
  toContactDTO,
  TimelineItemDTO,
  ContactTimelineResponseDTO,
} from "@/types/contact.types";

interface ContactUpsertParams {
  id?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  tags?: string[];
  notes?: string;
  customFields?: Prisma.InputJsonValue;
  avatarUrl?: string;
}

interface ContactFilterParams {
  search?: string;
  page?: number;
  limit?: number;
}

export const contactService = {
  /**
   * Find All with Optimization and Pagination
   */
  async findAll(companyId: string, params: ContactFilterParams) {
    const { search, page = 1, limit = 50 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.ContactWhereInput = {
      companyId,
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, contacts] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        // Optimized Select: Fetch only necessary fields for list view
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          avatarUrl: true,
          tags: true,
          notes: false, // Heavy text skipped for list
          customFields: false, // Json skipped for list
          createdAt: true,
          updatedAt: true,
          companyId: false, // Redundant
          deletedAt: false,
        },
      }),
    ]);

    // Partial DTO for list (casting since select omits some fields)
    const data = contacts.map((c) => ({
      ...c,
      notes: null,
      customFields: {},
      tags: c.tags,
    }));

    return {
      data: data.map((c) => toContactDTO(c as unknown as Contact)),
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  },

  /**
   * Get Detail by ID or Phone
   */
  async findOne(
    companyId: string,
    identifier: { id?: string; phone?: string },
  ) {
    if (!identifier.id && !identifier.phone)
      throw new AppError("ID or Phone required", 400);

    const contact = await prisma.contact.findFirst({
      where: {
        companyId,
        ...(identifier.id
          ? { id: identifier.id }
          : { phone: identifier.phone }),
        deletedAt: null,
      },
    });

    return contact ? toContactDTO(contact) : null;
  },

  /**
   * Upsert Logic with Zombie Recovery
   */
  async upsert(
    companyId: string,
    data: ContactUpsertParams,
  ): Promise<ContactDTO> {
    // 1. Sanitize
    let email = data.email?.toLowerCase().trim() || null;
    const phone = data.phone?.replace(/\D/g, "") || null;

    // 🛡️ 100-YEAR FIX: Handle WhatsApp Internal Emails
    // If email is an internal WhatsApp identifier (@whatsapp.user, @c.us),
    // we ONLY nullify it if we have a real phone number to use instead.
    // If phone is unavailable (LID scenario), keep the email as internal identifier.
    const isInternalEmail =
      email &&
      (email.includes("@whatsapp.user") ||
        email.includes("@c.us") ||
        email.includes("@lid"));

    if (isInternalEmail && phone) {
      // We have a real phone, so we can safely discard the internal email
      email = null;
    }
    // If isInternalEmail && !phone, we KEEP the email as our only identifier

    if (!phone && !email && !data.id) {
      throw new AppError(
        "Phone, Email or ID required",
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // 2. Resolve Existing
    let existingContact: Contact | null = null;

    if (data.id) {
      existingContact = await prisma.contact.findUnique({
        where: { id: data.id },
      });
      if (existingContact?.companyId !== companyId) existingContact = null;
    }

    if (!existingContact) {
      existingContact = await prisma.contact.findFirst({
        where: {
          companyId,
          OR: [phone ? { phone } : {}, email ? { email } : {}].filter(
            (o) => Object.keys(o).length > 0,
          ),
        },
      });
    }

    // 3. Update or Create
    if (existingContact) {
      return this.updateExisting(existingContact, {
        ...data,
        companyId,
        phone,
        email,
      });
    } else {
      return this.createNew(companyId, { ...data, phone, email });
    }
  },

  /**
   * Internal Update with Zombie Recovery
   */
  async updateExisting(
    existing: Contact,
    data: ContactUpsertParams & { companyId: string },
  ): Promise<ContactDTO> {
    try {
      const updated = await prisma.contact.update({
        where: { id: existing.id },
        data: {
          name: data.name || undefined,
          email: data.email,
          phone: data.phone,
          tags: data.tags,
          notes: data.notes,
          customFields: data.customFields,
          avatarUrl: data.avatarUrl,
        },
      });
      return toContactDTO(updated);
    } catch (error: unknown) {
      // 🛡️ TYPE-SAFE ERROR HANDLING: Prisma P2002 = Unique constraint violation
      const prismaError = error as { code?: string };
      if (prismaError.code === "P2002") {
        // Zombie logic
        const zombie = await prisma.contact.findFirst({
          where: {
            companyId: data.companyId,
            OR: [
              data.phone ? { phone: data.phone } : {},
              data.email ? { email: data.email } : {},
            ].filter((o) => Object.keys(o).length > 0),
            NOT: { id: existing.id },
            // We check if it's strictly a soft-deleted record causing conflict (unique constraints usually ignore soft-deleted if index includes deletedAt, but here index is [companyId, phone])
            // If unique index doesn't include deletedAt, then soft-deleted record BLOCKS creation.
          },
          // Logic assumes we prefer the LIVE record we are editing, so we nuke the zombie
        });

        if (zombie && zombie.deletedAt) {
          Logger.info(`[Contacts] 🧟 Recovering zombie contact ${zombie.id}`);
          // Anonymize zombie to free up phone/email
          await prisma.contact.update({
            where: { id: zombie.id },
            data: {
              phone: zombie.phone ? `${zombie.phone}_del_${Date.now()}` : null,
              email: zombie.email ? `${zombie.email}_del_${Date.now()}` : null,
            },
          });
          // Retry update
          const retry = await prisma.contact.update({
            where: { id: existing.id },
            data: {
              name: data.name || undefined,
              email: data.email,
              phone: data.phone,
              tags: data.tags,
              notes: data.notes,
              customFields: data.customFields,
              avatarUrl: data.avatarUrl,
            },
          });
          return toContactDTO(retry);
        }
        throw new AppError(
          "Conflict with another active contact",
          HTTP_STATUS.CONFLICT,
        );
      }
      throw error;
    }
  },

  /**
   * Internal Create
   */
  async createNew(
    companyId: string,
    data: ContactUpsertParams,
  ): Promise<ContactDTO> {
    const canCreate = await planLimitsService.canCreateResource(
      companyId,
      "contacts",
    );
    if (!canCreate)
      throw new AppError("Plan limit exceeded", HTTP_STATUS.FORBIDDEN);

    // 🛡️ 100-YEAR FIX: Use atomic upsert to prevent P2002 errors and race conditions
    // Contact has unique constraint on (companyId, phone)
    if (data.phone) {
      // Phone-based upsert (atomic, prevents duplicates)
      const contact = await prisma.contact.upsert({
        where: {
          companyId_phone: { companyId, phone: data.phone },
        },
        update: {
          // Only update if incoming data is better (non-empty)
          ...(data.name && { name: data.name }),
          ...(data.avatarUrl && { avatarUrl: data.avatarUrl }),
        },
        create: {
          companyId,
          name: data.name || "New Contact",
          email: data.email,
          phone: data.phone,
          tags: data.tags || [],
          notes: data.notes,
          customFields: data.customFields || {},
          avatarUrl: data.avatarUrl,
        },
      });
      return toContactDTO(contact);
    }

    // Email-only fallback (no unique constraint, use find+create pattern)
    if (data.email) {
      const existing = await prisma.contact.findFirst({
        where: { companyId, email: data.email },
      });

      if (existing) {
        const updated = await prisma.contact.update({
          where: { id: existing.id },
          data: {
            ...(data.name && { name: data.name }),
            ...(data.avatarUrl && { avatarUrl: data.avatarUrl }),
          },
        });
        return toContactDTO(updated);
      }

      const created = await prisma.contact.create({
        data: {
          companyId,
          name: data.name || "New Contact",
          email: data.email,
          tags: data.tags || [],
          notes: data.notes,
          customFields: data.customFields || {},
          avatarUrl: data.avatarUrl,
        },
      });
      return toContactDTO(created);
    }

    throw new AppError(
      "Phone or email required for contact creation",
      HTTP_STATUS.BAD_REQUEST,
    );
  },

  async delete(companyId: string, id: string) {
    const contact = await prisma.contact.findFirst({
      where: { id, companyId },
    });
    if (!contact)
      throw new AppError("Contact not found", HTTP_STATUS.NOT_FOUND);

    // Clean relations
    await prisma.$transaction([
      prisma.deal.updateMany({
        where: { contactId: id },
        data: { contactId: null },
      }),
      prisma.activity.updateMany({
        where: { contactId: id },
        data: { contactId: null },
      }),
      prisma.contact.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          phone: contact.phone ? `${contact.phone}_del_${Date.now()}` : null, // Free up phone
          email: contact.email ? `${contact.email}_del_${Date.now()}` : null, // Free up email
        },
      }),
    ]);
  },

  /**
   * Direct Update (Partial)
   */
  async update(
    companyId: string,
    id: string,
    data: Partial<ContactUpsertParams>,
  ): Promise<ContactDTO> {
    const contact = await prisma.contact.findFirst({
      where: { id, companyId },
    });
    if (!contact)
      throw new AppError("Contact not found", HTTP_STATUS.NOT_FOUND);

    const updated = await prisma.contact.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.email && { email: data.email }),
        ...(data.phone && { phone: data.phone }),
        ...(data.tags && { tags: data.tags }),
        ...(data.notes && { notes: data.notes }),
        ...(data.customFields && { customFields: data.customFields }),
        ...(data.avatarUrl && { avatarUrl: data.avatarUrl }),
      },
    });

    return toContactDTO(updated);
  },

  async getTimeline(
    companyId: string,
    id: string,
  ): Promise<ContactTimelineResponseDTO> {
    const contact = await prisma.contact.findFirst({
      where: { id, companyId },
    });
    if (!contact)
      throw new AppError("Contact not found", HTTP_STATUS.NOT_FOUND);

    // 🛡️100-YEAR FIX: Fetch related data for timeline.
    // Note: tickets and conversations are fetched for potential future use in timeline expansion.
    const [deals, activities, tickets, conversations] = await Promise.all([
      prisma.deal.findMany({
        where: { contactId: id },
        include: { stage: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.activity.findMany({
        where: { contactId: id },
        include: { createdBy: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.ticket.findMany({
        where: { companyId, createdById: id },
        orderBy: { createdAt: "desc" },
      }), // Reserved for future timeline integration
      contact.phone
        ? prisma.conversation.findMany({
            where: { companyId, channelId: contact.phone },
            include: { messages: { take: 1, orderBy: { createdAt: "desc" } } },
          })
        : Promise.resolve([]),
    ]);

    const timeline: TimelineItemDTO[] = [
      ...deals.map((d) => ({
        type: "DEAL" as const,
        id: d.id,
        date: d.createdAt.toISOString(),
        title: `Deal: ${d.title}`,
        subtitle: `${d.value} ${d.currency}`,
        icon: "💰",
        color: "green",
      })),
      ...activities.map((a) => ({
        type: "ACTIVITY" as const,
        id: a.id,
        date: a.createdAt.toISOString(),
        title: `${a.type}: ${a.subject}`,
        subtitle: a.description || "",
        icon: "📅",
        color: "yellow",
      })),
      ...tickets.map((t) => ({
        type: "TICKET" as const,
        id: t.id,
        date: t.createdAt.toISOString(),
        title: `Ticket #${t.ticketNumber}: ${t.subject}`,
        subtitle: t.status,
        icon: "🎫",
        color: "red",
      })),
      ...conversations.map((c) => ({
        type: "CONVERSATION" as const,
        id: c.id,
        date: c.createdAt.toISOString(),
        title: "Chat Iniciado",
        subtitle: c.messages[0]?.content || "Sin mensajes",
        icon: "💬",
        color: "blue",
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      contact: toContactDTO(contact),
      timeline,
    };
  },
};
