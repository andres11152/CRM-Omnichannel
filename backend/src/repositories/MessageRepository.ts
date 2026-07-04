import { prisma } from "@/config/database";
import { Message, Prisma, User, Conversation, MessageDirection } from "@prisma/client";

export class MessageRepository {
  async findMessageByWhatsAppId(
    whatsappMessageId: string,
    companyId: string,
  ): Promise<{
    id: string;
    conversationId: string;
    status: string;
    companyId: string;
    content: string;
    senderId: string;
    direction: MessageDirection;
    metadata: Prisma.JsonValue | null;
  } | null> {
    return prisma.message.findFirst({
      where: { whatsappMessageId, companyId },
      select: {
        id: true,
        conversationId: true,
        status: true,
        companyId: true,
        content: true,
        senderId: true,
        direction: true,
        metadata: true,
      },
    });
  }

  async updateByWhatsAppId(
    whatsappMessageId: string,
    companyId: string,
    data: Prisma.MessageUpdateInput,
  ): Promise<void> {
    await prisma.message.updateMany({
      where: { whatsappMessageId, companyId },
      data: data as Prisma.MessageUpdateManyMutationInput,
    });
  }

  async doesMessageExist(
    whatsappMessageId: string,
    companyId: string,
  ): Promise<boolean> {
    const count = await prisma.message.count({
      where: { whatsappMessageId, companyId },
    });
    return count > 0;
  }

  async findDuplicateOutbound(
    companyId: string,
    conversationId: string,
    content: string,
    timeThreshold: Date,
  ): Promise<Message | null> {
    return prisma.message.findFirst({
      where: {
        companyId,
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
    companyId: string,
    conversationId: string,
    limit: number = 10,
  ): Promise<Message[]> {
    return prisma.message.findMany({
      where: { companyId, conversationId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async findDuplicate(
    companyId: string,
    conversationId: string,
    content: string,
  ): Promise<Message | null> {
    const recent = new Date(Date.now() - 60 * 1000);
    return prisma.message.findFirst({
      where: {
        companyId,
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
  async findUnique<T extends Prisma.MessageFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.MessageFindUniqueArgs>
  ): Promise<Prisma.MessageGetPayload<T> | null> {
    return prisma.message.findUnique(args as Prisma.MessageFindUniqueArgs) as unknown as Promise<Prisma.MessageGetPayload<T> | null>;
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
    companyId: string,
    messageId: string,
  ): Promise<(Message & { conversation: Conversation }) | null> {
    return prisma.message.findFirst({
      where: { id: messageId, companyId },
      include: { conversation: true },
    });
  }

  /**
   * Generic findFirst with full Prisma args.
   */
  async findFirst<T extends Prisma.MessageFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.MessageFindFirstArgs>
  ): Promise<Prisma.MessageGetPayload<T> | null> {
    return prisma.message.findFirst(args as Prisma.MessageFindFirstArgs) as unknown as Promise<Prisma.MessageGetPayload<T> | null>;
  }

  /**
   * Generic findMany with full Prisma args.
   */
  async findMany<T extends Prisma.MessageFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.MessageFindManyArgs>
  ): Promise<Prisma.MessageGetPayload<T>[]> {
    return prisma.message.findMany(args as Prisma.MessageFindManyArgs) as unknown as Promise<Prisma.MessageGetPayload<T>[]>;
  }

  /**
   * [SEC] Race Condition Guard: Check if an AI-generated message was sent recently.
   * Used by AITriggerService to prevent duplicate AI responses.
   */
  async findRecentAIResponse(
    companyId: string,
    conversationId: string,
    windowMs: number = 8000,
  ): Promise<Message | null> {
    return prisma.message.findFirst({
      where: {
        companyId,
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
  async upsert<T extends Prisma.MessageUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.MessageUpsertArgs>
  ): Promise<Prisma.MessageGetPayload<T>> {
    return prisma.message.upsert(args as Prisma.MessageUpsertArgs) as unknown as Promise<Prisma.MessageGetPayload<T>>;
  }

  /**
   * Update many messages matching a filter.
   */
  async updateMany(args: Prisma.MessageUpdateManyArgs) {
    return prisma.message.updateMany(args);
  }

  /**
   * [SEC] Update a specific message by ID, scoped by companyId.
   */
  async update(id: string, data: Prisma.MessageUpdateInput, companyId?: string) {
    if (companyId) {
      const exists = await prisma.message.findFirst({ where: { id, companyId } });
      if (!exists) throw new Error(`Message ${id} not found in company ${companyId}`);
    }
    return prisma.message.update({
      where: { id },
      data,
    });
  }

  /**
   * Bulk create messages (with optional skipDuplicates).
   */
  async createMany(args: Prisma.MessageCreateManyArgs) {
    return prisma.message.createMany(args);
  }
}

export const messageRepository = new MessageRepository();
