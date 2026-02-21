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
        messages: { orderBy: { createdAt: "asc" }, take: 50 }, // Service optimization
      },
    });
  }

  async findByIdWithRelations(id: string) {
    return this.db.conversation.findUnique({
      where: { id },
      include: {
        participants: true,
        assignedTo: true,
        messages: { orderBy: { createdAt: "asc" } },
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
}

export const conversationRepository = new ConversationRepository();
