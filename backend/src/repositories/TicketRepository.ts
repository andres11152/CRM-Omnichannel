import { Prisma, Ticket } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";
import TenantContextManager from "@/config/tenantContext";
import { BaseRepository } from "./BaseRepository";
import { TicketWithRelations } from "@/types/ticket.types";

export class TicketRepository extends BaseRepository {
  constructor(db: ExtendedPrismaClient = prisma) {
    super(db);
  }

  async findById(id: string, companyId: string): Promise<Ticket | null> {
    return this.db.ticket.findFirst({ where: { id, companyId } });
  }

  async findUnique(args: Prisma.TicketFindUniqueArgs, companyId?: string): Promise<Ticket | null> {
    return this.db.ticket.findFirst(this.applyTenantFilter(args, companyId));
  }

  async findFirst(args: Prisma.TicketFindFirstArgs, companyId?: string): Promise<Ticket | null> {
    return this.db.ticket.findFirst(this.applyTenantFilter(args, companyId));
  }

  async findMany(args: Prisma.TicketFindManyArgs, companyId?: string): Promise<Ticket[]> {
    return this.db.ticket.findMany(this.applyTenantFilter(args, companyId));
  }

  async create(args: Prisma.TicketCreateArgs, companyIdOverride?: string): Promise<Ticket> {
    const companyId = companyIdOverride || TenantContextManager.getCompanyId();
    const data = {
      ...args.data,
      company: { connect: { id: companyId } },
    } as Prisma.TicketCreateInput;
    return this.db.ticket.create({ ...args, data });
  }

  async update(args: Prisma.TicketUpdateArgs, companyId?: string): Promise<Ticket> {
    return this.db.ticket.update(this.applyTenantFilter(args, companyId));
  }

  async updateMany(args: Prisma.TicketUpdateManyArgs, companyId?: string): Promise<Prisma.BatchPayload> {
    return this.db.ticket.updateMany(this.applyTenantFilter(args, companyId));
  }

  async count(args: Prisma.TicketCountArgs, companyId?: string): Promise<number> {
    return this.db.ticket.count(this.applyTenantFilter(args, companyId));
  }

  async getAgentLoads(agentIds: string[], companyId: string): Promise<Record<string, number>> {
    if (agentIds.length === 0) return {};

    const groups = await this.db.ticket.groupBy({
      by: ["assignedToId"],
      where: {
        assignedToId: { in: agentIds },
        companyId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
        conversation: { is: { isGroup: false } },
      },
      _count: {
        id: true,
      },
    });

    const loads: Record<string, number> = {};
    for (const agentId of agentIds) {
      loads[agentId] = 0;
    }
    for (const group of groups) {
      if (group.assignedToId) {
        loads[group.assignedToId] = group._count.id;
      }
    }
    return loads;
  }

  // Backwards compatibility for existing codebase callers
  async findByIdWithCreator(id: string, companyId: string): Promise<TicketWithRelations | null> {
    return (await this.db.ticket.findFirst({
      where: { id, companyId },
      include: {
        createdBy: true,
        assignedTo: true,
        queue: true,
        conversation: {
          include: {
            participants: true,
            contact: true, // [SOUND] Authoritative Name Resolve
          },
        },
      },
    })) as TicketWithRelations | null;
  }

  async findByConversationId(companyId: string, conversationId: string) {
    return this.db.ticket.findFirst({
      where: { conversationId, companyId },
      include: { createdBy: true },
    });
  }

  async updateConversationId(id: string, companyId: string, conversationId: string): Promise<void> {
    await this.db.ticket.update({
      where: { id, companyId },
      data: { conversationId },
    });
  }

  async getTicketsForExport(companyId: string, start: Date, end: Date) {
    return this.db.ticket.findMany({
      where: {
        companyId,
        createdAt: { gte: start, lte: end },
        deletedAt: null,
      },
      include: {
        createdBy: true,
        assignedTo: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }
}

export const ticketRepository = new TicketRepository();
