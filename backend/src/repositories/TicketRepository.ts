import { Ticket, Prisma, TicketStatus, TicketPriority } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class TicketRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findById(id: string): Promise<Ticket | null> {
    return this.db.ticket.findUnique({ where: { id } });
  }

  async findUnique(args: Prisma.TicketFindUniqueArgs) {
    return this.db.ticket.findUnique(args);
  }

  async findFirst(args: Prisma.TicketFindFirstArgs) {
    return this.db.ticket.findFirst(args);
  }

  async findMany(args: Prisma.TicketFindManyArgs) {
    return this.db.ticket.findMany(args);
  }

  async create(args: Prisma.TicketCreateArgs) {
    return this.db.ticket.create(args);
  }

  async update(args: Prisma.TicketUpdateArgs) {
    return this.db.ticket.update(args);
  }

  async count(args: Prisma.TicketCountArgs) {
    return this.db.ticket.count(args);
  }

  // Backwards compatibility for existing codebase callers
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

  async getTicketsForExport(companyId: string, start: Date, end: Date) {
    return this.db.ticket.findMany({
      where: { companyId, createdAt: { gte: start, lte: end } },
      select: {
        ticketNumber: true,
        subject: true,
        status: true,
        priority: true,
        createdAt: true,
        resolvedAt: true,
        assignedTo: { select: { name: true } },
        createdBy: { select: { name: true, email: true } },
      },
    });
  }

  async countByCompanyId(companyId: string): Promise<number> {
    return this.db.ticket.count({ where: { companyId } });
  }
}
export const ticketRepository = new TicketRepository();
