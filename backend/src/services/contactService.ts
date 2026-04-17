import { AppError } from "@/utils/AppError";
import { HTTP_STATUS } from "@/constants/httpStatus";
import { Logger } from "@/utils/logger";
import { planLimitsService } from "@/services/PlanLimitsService";
import { Contact, Prisma } from "@prisma/client";
import {
  ContactDTO,
  toContactDTO,
  TimelineItemDTO,
  ContactTimelineResponseDTO,
} from "@/types/contact.types";
import { contactRepository } from "@/repositories/ContactRepository";
import { dealRepository } from "@/repositories/DealRepository";
import { ticketRepository } from "@/repositories/TicketRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { webhookDispatcher } from "@/services/WebhookDispatcher";
import { WebhookEvents } from "@/types/types";

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
      contactRepository.count(where),
      contactRepository.findMany({
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

    const contact = await contactRepository.findFirst({
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

    // [SEC] 100-YEAR FIX: Handle WhatsApp Internal Emails
    const isInternalEmail =
      email &&
      (email.includes("@whatsapp.user") ||
        email.includes("@c.us") ||
        email.includes("@lid"));

    if (isInternalEmail && phone) {
      email = null;
    }

    if (!phone && !email && !data.id) {
      throw new AppError(
        "Phone, Email or ID required",
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // 2. Resolve Existing
    let existingContact: Contact | null = null;

    if (data.id) {
      existingContact = await contactRepository.findFirst({
        where: { id: data.id, companyId },
      });
    }

    if (!existingContact) {
      existingContact = await contactRepository.findFirst({
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
   * [SEC] 100-YEAR FIX: Tags are MERGED (union), never overwritten blindly.
   */
  async updateExisting(
    existing: Contact,
    data: ContactUpsertParams & { companyId: string },
  ): Promise<ContactDTO> {
    // [SEC] TAG MERGE: Union of existing tags + incoming tags (no duplicates, no destruction)
    const mergedTags = data.tags
      ? [...new Set([...existing.tags, ...data.tags])]
      : undefined;

    try {
      const updated = await contactRepository.update(data.companyId, existing.id, {
        name: data.name || undefined,
        email: data.email,
        phone: data.phone,
        tags: mergedTags,
        notes: data.notes,
        customFields: data.customFields || {},
        avatarUrl: data.avatarUrl,
      });
      return toContactDTO(updated);
    } catch (error: unknown) {
      // [SEC] TYPE-SAFE ERROR HANDLING: Prisma P2002 = Unique constraint violation
      const prismaError = error as { code?: string };
      if (prismaError.code === "P2002") {
        // Zombie logic
        const zombie = await contactRepository.findFirst({
          where: {
            companyId: data.companyId,
            OR: [
              data.phone ? { phone: data.phone } : {},
              data.email ? { email: data.email } : {},
            ].filter((o) => Object.keys(o).length > 0),
            NOT: { id: existing.id },
          },
        });

        if (zombie && zombie.deletedAt) {
          Logger.info(`[Contacts]  Recovering zombie contact ${zombie.id}`);
          // Anonymize zombie to free up phone/email
          await contactRepository.update(data.companyId, zombie.id, {
            phone: zombie.phone ? `${zombie.phone}_del_${Date.now()}` : null,
            email: zombie.email ? `${zombie.email}_del_${Date.now()}` : null,
          });
          // Retry update (with merged tags)
          const retry = await contactRepository.update(data.companyId, existing.id, {
            name: data.name || undefined,
            email: data.email,
            phone: data.phone,
            tags: mergedTags,
            notes: data.notes,
            customFields: data.customFields || {},
            avatarUrl: data.avatarUrl,
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

    // [SEC] 100-YEAR FIX: Use atomic upsert to prevent P2002 errors and race conditions
    if (data.phone) {
      // Phone-based upsert (atomic, prevents duplicates)
      const contact = await contactRepository.upsertByPhone(
        companyId,
        data.phone,
        {
          name: data.name,
          avatarUrl: data.avatarUrl,
          email: data.email,
          tags: data.tags || [],
          notes: data.notes,
          customFields: data.customFields || {},
        },
      );

      // [WEBHOOK] Dispatch contact.created event
      void webhookDispatcher.dispatch(companyId, WebhookEvents.CONTACT_CREATED, {
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
      });

      return toContactDTO(contact);
    }

    // Email-only fallback (no unique constraint, use find+create pattern)
    if (data.email) {
      const existing = await contactRepository.findFirst({
        where: { companyId, email: data.email },
      });

      if (existing) {
        const updated = await contactRepository.update(companyId, existing.id, {
          ...(data.name && { name: data.name }),
          ...(data.avatarUrl && { avatarUrl: data.avatarUrl }),
        });
        return toContactDTO(updated);
      }

      const created = await contactRepository.create(
        companyId,
        "", // No phone
        data.name || "New Contact",
      );
      // Update with additional fields if present
      if (
        data.email ||
        data.tags ||
        data.notes ||
        data.customFields ||
        data.avatarUrl
      ) {
        const withExtras = await contactRepository.update(companyId, created.id, {
          email: data.email,
          tags: data.tags || [],
          notes: data.notes,
          customFields: data.customFields || {},
          avatarUrl: data.avatarUrl,
        });
        return toContactDTO(withExtras);
      }
      return toContactDTO(created);
    }

    throw new AppError(
      "Phone or email required for contact creation",
      HTTP_STATUS.BAD_REQUEST,
    );
  },

  async delete(companyId: string, id: string) {
    const contact = await contactRepository.findFirst({
      where: { id, companyId },
    });
    if (!contact)
      throw new AppError("Contact not found", HTTP_STATUS.NOT_FOUND);

    // Clean relations and soft-delete in transaction
    await contactRepository.softDeleteWithCleanup(companyId, id, contact);
  },

  /**
   * Direct Update (Partial)
   */
  async update(
    companyId: string,
    id: string,
    data: Partial<ContactUpsertParams>,
  ): Promise<ContactDTO> {
    const contact = await contactRepository.findFirst({
      where: { id, companyId },
    });
    if (!contact)
      throw new AppError("Contact not found", HTTP_STATUS.NOT_FOUND);

    const updated = await contactRepository.update(companyId, contact.id, {
      ...(data.name && { name: data.name }),
      ...(data.email && { email: data.email }),
      ...(data.phone && { phone: data.phone }),
      ...(data.tags && { tags: data.tags }),
      ...(data.notes && { notes: data.notes }),
      ...(data.customFields && { customFields: data.customFields }),
      ...(data.avatarUrl && { avatarUrl: data.avatarUrl }),
    });

    // [WEBHOOK] Dispatch contact.updated event
    void webhookDispatcher.dispatch(companyId, WebhookEvents.CONTACT_UPDATED, {
      id: updated.id,
      name: updated.name,
      phone: updated.phone,
      email: updated.email,
      changedFields: Object.keys(data),
    });

    return toContactDTO(updated);
  },

  async getTimeline(
    companyId: string,
    id: string,
  ): Promise<ContactTimelineResponseDTO> {
    const contact = await contactRepository.findFirst({
      where: { id, companyId },
    });
    if (!contact)
      throw new AppError("Contact not found", HTTP_STATUS.NOT_FOUND);

    // [SEC]100-YEAR FIX: Fetch related data for timeline.
    const [deals, activities, tickets, conversations] = await Promise.all([
      dealRepository.findMany({ contactId: id }, [{ createdAt: "desc" }]),
      contactRepository.findActivities(id),
      ticketRepository.findMany({
        where: { companyId, createdById: id },
        orderBy: { createdAt: "desc" },
      }),
      contact.phone
        ? conversationRepository
            .findFirst({
              where: { companyId, channelId: contact.phone },
              include: {
                messages: { take: 1, orderBy: { createdAt: "desc" } },
              },
            })
            .then((c) => (c ? [c] : []))
        : Promise.resolve([]),
    ]);

    const timeline: TimelineItemDTO[] = [
      ...deals.map((d) => ({
        type: "DEAL" as const,
        id: d.id,
        date: d.createdAt.toISOString(),
        title: `Deal: ${d.title}`,
        subtitle: `${d.value} ${d.currency}`,
        icon: "[BILLING]",
        color: "green",
      })),
      ...activities.map((a) => ({
        type: "ACTIVITY" as const,
        id: a.id,
        date: a.createdAt.toISOString(),
        title: `${a.type}: ${a.subject}`,
        subtitle: a.description || "",
        icon: "[DATE]",
        color: "yellow",
      })),
      ...tickets.map((t) => ({
        type: "TICKET" as const,
        id: t.id,
        date: t.createdAt.toISOString(),
        title: `Ticket #${t.ticketNumber}: ${t.subject}`,
        subtitle: t.status,
        icon: "",
        color: "red",
      })),
      ...conversations.map((c) => ({
        type: "CONVERSATION" as const,
        id: c.id,
        date: c.createdAt.toISOString(),
        title: "Chat Iniciado",
        subtitle:
          (c as { messages?: Array<{ content: string }> }).messages?.[0]
            ?.content || "Sin mensajes",
        icon: "[CHAT]",
        color: "blue",
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      contact: toContactDTO(contact),
      timeline,
    };
  },

  /**
   * Check if a contact with a given phone or email already exists in the company
   */
  async checkDuplicate(
    companyId: string,
    phone?: string | null,
    email?: string | null,
  ): Promise<boolean> {
    const orConditions = [
      phone ? { phone: { endsWith: phone.slice(-10) } } : {},
      email ? { email } : {},
    ].filter((o) => Object.keys(o).length > 0);

    if (orConditions.length === 0) return false;

    const exists = await contactRepository.findFirst({
      where: {
        companyId,
        OR: orConditions,
      },
    });

    return !!exists;
  },

  /**
   * Bulk create contacts via transaction
   */
  async bulkCreate(contacts: Array<Record<string, unknown>>) {
    if (contacts.length === 0) return;
    await contactRepository.bulkCreate(
      contacts as Array<Prisma.ContactCreateInput>,
    );
  },
};

