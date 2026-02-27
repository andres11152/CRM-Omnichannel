import { prisma } from "@/config/database";
import { MessageTemplate, Prisma } from "@prisma/client";

/**
 * 📝 MESSAGE TEMPLATE REPOSITORY
 *
 * Handles all database operations for the MessageTemplate model.
 * Used by WhatsAppService for template-based messaging.
 */
export class MessageTemplateRepository {
  async findById(id: string): Promise<MessageTemplate | null> {
    return prisma.messageTemplate.findUnique({
      where: { id },
    });
  }

  async findMany(args: Prisma.MessageTemplateFindManyArgs) {
    return prisma.messageTemplate.findMany(args);
  }

  async findByCompany(companyId: string): Promise<MessageTemplate[]> {
    return prisma.messageTemplate.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
  }
}

export const messageTemplateRepository = new MessageTemplateRepository();
