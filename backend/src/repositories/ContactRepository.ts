import { Contact } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";
import { Logger } from "@/utils/logger";

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

  async update(id: string, data: Partial<Contact>): Promise<Contact> {
    return this.db.contact.update({
      where: { id },
      data,
    });
  }

  async findWithDeleted(
    companyId: string,
    phone: string,
  ): Promise<Contact | null> {
    // 🛡️ 100-YEAR FIX: Use a safe functional cast instead of 'any' to support custom middleware arguments
    const findFirst = this.db.contact.findFirst as (
      args: unknown,
    ) => Promise<Contact | null>;
    return findFirst({
      where: { companyId, phone },
      includeDeleted: true,
    });
  }
}
