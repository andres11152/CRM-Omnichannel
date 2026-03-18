import { Conversation, Prisma, ConversationStatus } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class ConversationRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findByChannelId(
    companyId: string,
    channelId: string,
  ): Promise<Conversation | null> {
    return this.db.conversation.findFirst({
      where: { companyId, channelId },
      orderBy: { createdAt: "desc" },
    });
  }

  async upsert(args: Prisma.ConversationUpsertArgs) {
    return this.db.conversation.upsert(args);
  }

  async findByContactId(
    companyId: string,
    contactId: string,
  ): Promise<Conversation | null> {
    return this.db.conversation.findFirst({
      where: { companyId, contactId },
      orderBy: { updatedAt: "desc" },
    });
  }

  async findByIdAndCompanyId(
    id: string,
    companyId: string,
  ): Promise<Conversation | null> {
    return this.db.conversation.findFirst({
      where: { id, companyId },
    });
  }

  async updateConversation(
    id: string,
    data: Prisma.ConversationUpdateInput,
  ): Promise<Conversation> {
    return this.db.conversation.update({
      where: { id },
      data,
    });
  }

  async update(
    id: string,
    data: Prisma.ConversationUpdateInput,
  ): Promise<Conversation> {
    return this.db.conversation.update({
      where: { id },
      data,
    });
  }

  async create(data: {
    companyId: string;
    channelId: string;
    subject: string;
    userId: string; // Participant
    contactId?: string;
    queueId?: string;
    status?: ConversationStatus;
  }): Promise<Conversation> {
    return this.db.conversation.create({
      data: {
        companyId: data.companyId,
        channelId: data.channelId,
        subject: data.subject,
        status: data.status || "OPEN",
        participants: { connect: [{ id: data.userId }] },
        contactId: data.contactId,
        queueId: data.queueId,
      },
    });
  }

  // Extended Methods for Service

  async count(args: Prisma.ConversationCountArgs): Promise<number> {
    return this.db.conversation.count(args);
  }

  async findAll(
    where: Prisma.ConversationWhereInput,
    options?: { take?: number; skip?: number },
  ) {
    return this.db.conversation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: options?.take,
      skip: options?.skip,
      include: {
        participants: true,
        assignedTo: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { reactions: true },
        }, // Service optimization
      },
    });
  }

  async findByIdWithRelations(id: string) {
    return this.db.conversation.findUnique({
      where: { id },
      include: {
        participants: true,
        assignedTo: true,
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            reactions: true,
            sender: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Find conversation with participants, assignedTo, and queue (with AI assistant).
   * Used by chatService.getFullConversation for message processing context.
   */
  async findByIdWithQueueAndParticipants(id: string) {
    return this.db.conversation.findUnique({
      where: { id },
      include: {
        participants: true,
        assignedTo: true,
        queue: { include: { aiAssistant: true } },
      },
    });
  }

  async updateTags(id: string, tags: string[]) {
    return this.db.conversation.update({
      where: { id },
      data: { tags },
    });
  }

  // 🔴 Badge Logic
  async incrementUnread(id: string): Promise<Conversation> {
    return this.db.conversation.update({
      where: { id },
      data: {
        unreadCount: { increment: 1 },
        updatedAt: new Date(),
      },
    });
  }

  async resetUnread(id: string): Promise<Conversation> {
    return this.db.conversation.update({
      where: { id },
      data: {
        unreadCount: 0,
        // updatedAt is usually NOT updated on read, to preserve sort order by last message
      },
    });
  }

  /**
   * Generic findFirst with full Prisma args.
   */
  async findFirst(args: Prisma.ConversationFindFirstArgs) {
    return this.db.conversation.findFirst(args);
  }

  /**
   * Generic create with full Prisma args (for unchecked creates with raw fields).
   */
  async createRaw(args: Prisma.ConversationCreateArgs) {
    return this.db.conversation.create(args);
  }

  /**
   * Generic findUnique with full Prisma args.
   */
  async findUnique(args: Prisma.ConversationFindUniqueArgs) {
    return this.db.conversation.findUnique(args);
  }

  /**
   * Generic findMany with full Prisma args.
   */
  async findMany(args: Prisma.ConversationFindManyArgs) {
    return this.db.conversation.findMany(args);
  }
}

export const conversationRepository = new ConversationRepository();
