import { Ticket, Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class TicketRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findById(id: string): Promise<Ticket | null> {
    return this.db.ticket.findUnique({ where: { id } });
  }

  async findByIdWithCreator(id: string) {
    return this.db.ticket.findUnique({
      where: { id },
      include: { createdBy: true },
    });
  }

  async findByConversationId(conversationId: string) {
    return this.db.ticket.findFirst({
      where: { conversationId },
      include: { createdBy: true },
    });
  }

  async updateConversationId(
    id: string,
    conversationId: string,
  ): Promise<Ticket> {
    return this.db.ticket.update({
      where: { id },
      data: { conversationId },
    });
  }
}
