import { prisma } from "@/config/database";
import { Message, Prisma, User } from "@prisma/client";
import { MessageMetadata } from "@/types/whatsapp.types";

export class MessageRepository {
  async findMessageByWhatsAppId(whatsappMessageId: string): Promise<{
    id: string;
    conversationId: string;
    status: string;
    companyId: string;
  } | null> {
    return prisma.message.findUnique({
      where: { whatsappMessageId },
      select: {
        id: true,
        conversationId: true,
        status: true,
        companyId: true,
      },
    });
  }

  async doesMessageExist(whatsappMessageId: string): Promise<boolean> {
    const count = await prisma.message.count({
      where: { whatsappMessageId },
    });
    return count > 0;
  }

  async findDuplicateOutbound(
    conversationId: string,
    content: string,
    timeThreshold: Date,
  ): Promise<Message | null> {
    return prisma.message.findFirst({
      where: {
        conversationId,
        direction: "OUTBOUND",
        content,
        createdAt: { gt: timeThreshold },
      },
    });
  }

  async getSessionOwner(
    phone: string,
    companyId: string,
  ): Promise<User | null> {
    return prisma.user.findFirst({
      where: { phone, companyId },
    });
  }

  async getDefaultAgent(companyId: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: { companyId, role: "ADMIN" },
    });
  }

  async getConversationHistory(
    conversationId: string,
    limit: number = 10,
  ): Promise<Message[]> {
    return prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async findDuplicate(
    conversationId: string,
    content: string,
  ): Promise<Message | null> {
    const recent = new Date(Date.now() - 60 * 1000);
    return prisma.message.findFirst({
      where: {
        conversationId,
        content,
        createdAt: { gt: recent },
      },
    });
  }

  /**
   * Creates a new message directly in the database.
   * Useful for logging failed messages or simple inserts bypassing complex logic.
   */
  async create(data: Prisma.MessageUncheckedCreateInput): Promise<Message> {
    return prisma.message.create({
      data,
    });
  }
}

export const messageRepository = new MessageRepository();
