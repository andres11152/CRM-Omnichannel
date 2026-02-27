import { prisma } from "@/config/database";
import { Message, Prisma, User, Conversation } from "@prisma/client";

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
  async create(args: Prisma.MessageCreateArgs) {
    return prisma.message.create(args);
  }

  /**
   * Generic findUnique with full Prisma args.
   */
  async findUnique(args: Prisma.MessageFindUniqueArgs) {
    return prisma.message.findUnique(args);
  }

  /**
   * Generic count with full Prisma args.
   */
  async count(args: Prisma.MessageCountArgs) {
    return prisma.message.count(args);
  }

  /**
   * Find a message by ID with its conversation relation.
   * Used by markAsRead to resolve the channelId.
   */
  async findWithConversation(
    messageId: string,
  ): Promise<(Message & { conversation: Conversation }) | null> {
    return prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: true },
    });
  }

  /**
   * Generic findFirst with full Prisma args.
   */
  async findFirst(args: Prisma.MessageFindFirstArgs) {
    return prisma.message.findFirst(args);
  }

  /**
   * Generic findMany with full Prisma args.
   */
  async findMany(args: Prisma.MessageFindManyArgs) {
    return prisma.message.findMany(args);
  }

  /**
   * 🛡️ Race Condition Guard: Check if an AI-generated message was sent recently.
   * Used by AITriggerService to prevent duplicate AI responses.
   */
  async findRecentAIResponse(
    conversationId: string,
    windowMs: number = 8000,
  ): Promise<Message | null> {
    return prisma.message.findFirst({
      where: {
        conversationId,
        createdAt: { gt: new Date(Date.now() - windowMs) },
        metadata: {
          path: ["aiGenerated"],
          equals: true,
        },
      },
    });
  }

  /**
   * Upsert a message (create if not exists, update if exists).
   */
  async upsert(args: Prisma.MessageUpsertArgs) {
    return prisma.message.upsert(args);
  }

  /**
   * Update many messages matching a filter.
   */
  async updateMany(args: Prisma.MessageUpdateManyArgs) {
    return prisma.message.updateMany(args);
  }

  /**
   * Bulk create messages (with optional skipDuplicates).
   */
  async createMany(args: Prisma.MessageCreateManyArgs) {
    return prisma.message.createMany(args);
  }
}

export const messageRepository = new MessageRepository();
