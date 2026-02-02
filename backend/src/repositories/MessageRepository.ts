import { Message, Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";
import { CreateMessageParams } from "@/types/message.types";

export class MessageRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findDuplicate(
    conversationId: string,
    content: string,
    timeWindowMs: number = 5000,
  ): Promise<Message | null> {
    return this.db.message.findFirst({
      where: {
        conversationId,
        content,
        createdAt: { gt: new Date(Date.now() - timeWindowMs) },
      },
    });
  }

  async create(data: CreateMessageParams): Promise<Message> {
    return this.db.message.create({
      data: {
        companyId: data.companyId,
        conversationId: data.conversationId,
        content: data.content,
        direction: data.direction,
        senderId: data.senderId,
        channel: data.channel,
        // Status is likely a String field in Prisma schema or managed implicitly.
        // We pass the string directly (Type safety ensured by CreateMessageParams interface).
        status: data.status || "SENT",
        metadata: data.metadata || Prisma.JsonNull,
      },
      include: { sender: true },
    });
  }
}
