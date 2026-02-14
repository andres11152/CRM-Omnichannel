import { Ticket, Prisma, TicketStatus, TicketPriority } from "@prisma/client";
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

  async create(data: {
    companyId: string;
    conversationId?: string;
    subject: string;
    status?: TicketStatus;
    priority?: TicketPriority;
    createdById: string;
    assignedToId?: string;
    queueId?: string;
  }): Promise<Ticket> {
    const lastTicket = await this.db.ticket.findFirst({
      where: { companyId: data.companyId },
      orderBy: { ticketNumber: "desc" },
      select: { ticketNumber: true },
    });

    const ticketNumber = (lastTicket?.ticketNumber || 0) + 1;

    return this.db.ticket.create({
      data: {
        ticketNumber,
        companyId: data.companyId,
        conversationId: data.conversationId,
        subject: data.subject,
        description: "Chat iniciado manualmente por agente",
        status: data.status ?? TicketStatus.OPEN,
        priority: data.priority ?? TicketPriority.MEDIUM,
        createdById: data.createdById,
        assignedToId: data.assignedToId,
        queueId: data.queueId,
      },
    });
  }
}
export const ticketRepository = new TicketRepository();
