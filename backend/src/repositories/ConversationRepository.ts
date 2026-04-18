import { Conversation, Prisma, ConversationStatus } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";
import { Logger } from "@/utils/logger";

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
    companyId: string,
    id: string,
    data: Prisma.ConversationUncheckedUpdateInput,
  ): Promise<Conversation> {
    const existing = await this.db.conversation.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new Error("Conversation not found or access denied");

    return this.db.conversation.update({
      where: { id },
      data,
    });
  }

  async update(
    companyId: string,
    id: string,
    data: Prisma.ConversationUncheckedUpdateInput,
  ): Promise<Conversation> {
    const existing = await this.db.conversation.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new Error("Conversation not found or access denied");

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

  async findByIdWithRelations(companyId: string, id: string) {
    return this.db.conversation.findFirst({
      where: { id, companyId },
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
        contact: true,
      },
    });
  }

  /**
   * Find conversation with participants, assignedTo, and queue (with AI assistant).
   * Used by chatService.getFullConversation for message processing context.
   */
  async findByIdWithQueueAndParticipants(companyId: string, id: string) {
    return this.db.conversation.findFirst({
      where: { id, companyId },
      include: {
        participants: true,
        assignedTo: true,
        queue: { include: { aiAssistant: true } },
      },
    });
  }

  async updateTags(companyId: string, id: string, tags: string[]) {
    const existing = await this.db.conversation.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new Error("Conversation not found or access denied");

    return this.db.conversation.update({
      where: { id },
      data: { tags },
    });
  }

  // [OFFLINE] Badge Logic
  async incrementUnread(companyId: string, id: string): Promise<Conversation> {
    const existing = await this.db.conversation.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new Error("Conversation not found or access denied");

    return this.db.conversation.update({
      where: { id },
      data: {
        unreadCount: { increment: 1 },
        updatedAt: new Date(),
      },
    });
  }

  async resetUnread(companyId: string, id: string): Promise<Conversation> {
    const existing = await this.db.conversation.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new Error("Conversation not found or access denied");

    return this.db.conversation.update({
      where: { id },
      data: {
        unreadCount: 0,
        // updatedAt is usually NOT updated on read, to preserve sort order by last message
      },
    });
  }

  /**
   * FindOrCreate Pattern (Ported from ConversationManager)
   */
  async findOrCreate(params: {
    companyId: string;
    channelId: string;
    customerId: string;
    subject?: string;
    status?: ConversationStatus;
  }): Promise<Conversation> {
    const { companyId, channelId, customerId, subject, status } = params;

    return this.db.$transaction(
      async (tx) => {
        const conversation = await tx.conversation.findFirst({
          where: { companyId, channelId },
          include: { participants: true, assignedTo: true },
        });

        if (conversation) {
          const isAssigned = !!conversation.assignedToId;
          let newStatus = conversation.status;
          if (["CLOSED", "RESOLVED"].includes(conversation.status)) {
            newStatus = isAssigned ? "IN_PROGRESS" : "OPEN";
          }

          return tx.conversation.update({
            where: { id: conversation.id },
            data: { status: newStatus, updatedAt: new Date() },
            include: { participants: true, assignedTo: true },
          });
        }

        try {
          return await tx.conversation.create({
            data: {
              companyId,
              channelId: subject || channelId,
              status: status || "OPEN",
              participants: { connect: [{ id: customerId }] },
            },
            include: { participants: true, assignedTo: true },
          });
        } catch (err: unknown) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2002"
          ) {
            Logger.warn(
              `[ConvRepo] findOrCreate Race detected for ${channelId}`,
            );
            return tx.conversation.findFirstOrThrow({
              where: { companyId, channelId },
              include: { participants: true, assignedTo: true },
            });
          }
          throw err;
        }
      },
      { isolationLevel: "Serializable" },
    );
  }

  /**
   * findOrCreateWithTicket (Ported from ConversationResolver)
   */
  async findOrCreateWithTicket(params: {
    companyId: string;
    phone: string;
    subject: string;
    userId: string;
    sessionId?: string;
    contactId?: string;
  }): Promise<Conversation> {
    const { companyId, phone, subject, userId, sessionId, contactId } = params;

    return this.db.$transaction(async (tx) => {
      // 1. Check existing
      let conversation = await tx.conversation.findFirst({
        where: { companyId, channelId: phone },
      });

      if (conversation) return conversation;

      // 2. Queue Assignment
      let queueId: string | null = null;
      if (sessionId) {
        const session = await tx.whatsAppSession.findUnique({
          where: { sessionId },
          select: { defaultQueueId: true },
        });
        queueId = session?.defaultQueueId || null;
      }

      // 3. Create Conversation
      conversation = await tx.conversation.create({
        data: {
          companyId,
          channelId: phone,
          subject,
          status: "OPEN",
          participants: { connect: [{ id: userId }] },
          contactId,
          queueId,
        },
      });

      // 4. Create Ticket
      const lastTicket = await tx.ticket.findFirst({
        where: { companyId },
        orderBy: { ticketNumber: "desc" },
        select: { ticketNumber: true },
      });

      await tx.ticket.create({
        data: {
          companyId,
          ticketNumber: (lastTicket?.ticketNumber || 0) + 1,
          subject,
          description: "Chat iniciado en WhatsApp",
          status: "OPEN",
          priority: "MEDIUM",
          createdById: userId,
          conversationId: conversation.id,
          queueId,
        },
      });

      return conversation;
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
   * Includes race-condition protection for concurrent inbound workers.
   */
  async createRaw(args: Prisma.ConversationCreateArgs) {
    try {
      return await this.db.conversation.create(args);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        Logger.warn(`[ConvRepo] Race condition caught on createRaw. Resolving to existing conversation...`);
        const companyId = args.data.companyId as string | undefined;
        const channelId = args.data.channelId as string | undefined;
        
        if (companyId && channelId) {
             const existing = await this.db.conversation.findFirst({
                 where: { companyId, channelId },
                 include: args.include as any
             });
             if (existing) return existing as any;
        }
      }
      throw error;
    }
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
