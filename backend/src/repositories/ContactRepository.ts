import { Contact, Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class ContactRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findByPhone(companyId: string, phone: string): Promise<Contact | null> {
    return this.db.contact.findFirst({
      where: {
        companyId,
        phone: { in: [phone, `+${phone}`] },
      },
    });
  }

  async findByLid(companyId: string, lid: string): Promise<Contact | null> {
    return this.db.contact.findFirst({
      where: { companyId, phone: lid },
    });
  }

  async findMany(args: Prisma.ContactFindManyArgs) {
    return this.db.contact.findMany(args);
  }

  async findUnique(args: Prisma.ContactFindUniqueArgs) {
    return this.db.contact.findUnique(args);
  }

  async createRaw(args: Prisma.ContactCreateArgs) {
    return this.db.contact.create(args);
  }

  async upsert(args: Prisma.ContactUpsertArgs) {
    return this.db.contact.upsert(args);
  }

  async create(
    companyId: string,
    phone: string,
    name?: string,
  ): Promise<Contact> {
    return this.db.contact.create({
      data: {
        companyId,
        phone,
        name,
        tags: ["WHATSAPP_LEAD"],
      },
    });
  }

  async update(
    companyId: string,
    id: string,
    data: Prisma.ContactUncheckedUpdateInput,
  ): Promise<Contact> {
    const existing = await this.db.contact.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new Error("Contact not found or access denied");

    return this.db.contact.update({
      where: { id },
      data,
    });
  }

  async updateMany(args: Prisma.ContactUpdateManyArgs) {
    return this.db.contact.updateMany(args);
  }

  async findWithDeleted(
    companyId: string,
    phone: string,
  ): Promise<Contact | null> {
    // [SEC] 100-YEAR FIX: Use a safe functional cast instead of 'any' to support custom middleware arguments
    const findFirst = this.db.contact.findFirst as (
      args: unknown,
    ) => Promise<Contact | null>;
    return findFirst({
      where: { companyId, phone },
      includeDeleted: true,
    });
  }

  /**
   * Generic findFirst with full Prisma args.
   */
  async findFirst(args: Prisma.ContactFindFirstArgs) {
    return this.db.contact.findFirst(args);
  }

  /**
   * Generic update with full Prisma args.
   */
  async updateByArgs(args: Prisma.ContactUpdateArgs) {
    return this.db.contact.update(args);
  }

  /**
   * Count contacts matching a filter.
   */
  async count(where: Prisma.ContactWhereInput): Promise<number> {
    return this.db.contact.count({ where });
  }

  /**
   * Atomic phone-based upsert (prevents P2002 race conditions).
   */
  async upsertByPhone(
    companyId: string,
    phone: string,
    data: {
      name?: string;
      avatarUrl?: string;
      email?: string | null;
      tags?: string[];
      notes?: string;
      customFields?: Prisma.InputJsonValue;
    },
  ): Promise<Contact> {
    return this.db.contact.upsert({
      where: {
        companyId_phone: { companyId, phone },
      },
      update: {
        ...(data.name && { name: data.name }),
        ...(data.avatarUrl && { avatarUrl: data.avatarUrl }),
      },
      create: {
        companyId,
        name: data.name || "New Contact",
        email: data.email,
        phone,
        tags: data.tags || [],
        notes: data.notes,
        customFields: data.customFields || {},
        avatarUrl: data.avatarUrl,
      },
    });
  }

  /**
   * Soft-delete a contact with transactional relation cleanup.
   * Encapsulates the $transaction to keep ORM isolated in the repository.
   */
  async softDeleteWithCleanup(
    companyId: string,
    id: string,
    contact: Contact,
  ): Promise<void> {
    const existing = await this.db.contact.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new Error("Contact not found or access denied");

    await this.db.$transaction([
      this.db.deal.updateMany({
        where: { contactId: id },
        data: { contactId: null },
      }),
      this.db.activity.updateMany({
        where: { contactId: id },
        data: { contactId: null },
      }),
      this.db.contact.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          phone: contact.phone ? `${contact.phone}_del_${Date.now()}` : null,
          email: contact.email ? `${contact.email}_del_${Date.now()}` : null,
        },
      }),
    ]);
  }

  /**
   * Find activities for a contact (timeline use).
   */
  async findActivities(contactId: string) {
    return this.db.activity.findMany({
      where: { contactId },
      include: { createdBy: true },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Bulk create contacts via transaction.
   */
  async bulkCreate(contacts: Array<Prisma.ContactCreateInput>): Promise<void> {
    await this.db.$transaction(
      contacts.map((c) => this.db.contact.create({ data: c })),
    );
  }
}

export const contactRepository = new ContactRepository();
