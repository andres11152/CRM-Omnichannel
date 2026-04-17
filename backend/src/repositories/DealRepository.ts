import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export class DealRepository {
  async findMany(
    where: Prisma.DealWhereInput,
    orderBy: Prisma.DealOrderByWithRelationInput[],
  ) {
    return prisma.deal.findMany({
      where,
      include: {
        pipeline: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true, color: true, order: true } },
        account: { select: { name: true } },
        contact: { select: { name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
      orderBy,
    });
  }

  async findUnique(args: Prisma.DealFindUniqueArgs) {
    return prisma.deal.findUnique(args);
  }

  async findById(id: string, companyId: string) {
    return prisma.deal.findFirst({
      where: { id, companyId },
      include: {
        pipeline: true,
        stage: true,
        account: true,
        contact: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        activities: {
          orderBy: { createdAt: "desc" },
          include: {
            createdBy: { select: { name: true } },
            assignedTo: { select: { name: true } },
          },
        },
      },
    });
  }

  async create(data: Prisma.DealCreateInput) {
    return prisma.deal.create({
      data,
      include: {
        pipeline: true,
        stage: true,
        account: true,
        contact: true,
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async update(
    id: string,
    companyId: string,
    data: Prisma.DealUpdateInput | Prisma.DealUncheckedUpdateInput,
  ) {
    // [SEC] Verify ownership before update
    const exists = await prisma.deal.findFirst({ where: { id, companyId } });
    if (!exists) throw new Error(`Deal ${id} not found in company ${companyId}`);
    return prisma.deal.update({
      where: { id },
      data,
      include: {
        pipeline: true,
        stage: true,
        account: true,
        contact: true,
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async delete(id: string, companyId: string) {
    // [SEC] Verify ownership before delete
    const exists = await prisma.deal.findFirst({ where: { id, companyId } });
    if (!exists) throw new Error(`Deal ${id} not found in company ${companyId}`);
    return prisma.deal.delete({ where: { id } });
  }

  async getMaxOrder(stageId: string) {
    return prisma.deal.aggregate({
      where: { stageId },
      _max: { order: true },
    });
  }

  async count(where: Prisma.DealWhereInput) {
    return prisma.deal.count({ where });
  }
}

export const dealRepository = new DealRepository();
