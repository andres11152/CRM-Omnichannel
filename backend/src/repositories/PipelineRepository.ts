import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export class PipelineRepository {
  async findMany(companyId: string) {
    return prisma.pipeline.findMany({
      where: { companyId },
      include: {
        stages: {
          orderBy: { order: "asc" },
        },
        _count: {
          select: { deals: true },
        },
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
  }

  async findById(id: string, companyId: string) {
    return prisma.pipeline.findFirst({
      where: { id, companyId },
      include: {
        stages: {
          orderBy: { order: "asc" },
          include: {
            deals: {
              orderBy: { order: "asc" },
              include: {
                account: { select: { name: true } },
                contact: { select: { name: true, email: true } },
                assignedTo: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
        _count: {
          select: { deals: true },
        },
      },
    });
  }

  async findDefault(companyId: string) {
    return prisma.pipeline.findFirst({
      where: { companyId, isDefault: true },
      include: { stages: { orderBy: { order: "asc" }, take: 1 } },
    });
  }

  async create(data: Prisma.PipelineCreateInput) {
    return prisma.pipeline.create({ data });
  }

  async update(id: string, companyId: string, data: Prisma.PipelineUpdateInput) {
    // [SEC] Verify ownership before update
    const exists = await prisma.pipeline.findFirst({ where: { id, companyId } });
    if (!exists) throw new Error(`Pipeline ${id} not found in company ${companyId}`);
    return prisma.pipeline.update({
      where: { id },
      data,
      include: {
        stages: { orderBy: { order: "asc" } },
      },
    });
  }

  async delete(id: string, companyId: string) {
    // [SEC] Verify ownership before delete
    const exists = await prisma.pipeline.findFirst({ where: { id, companyId } });
    if (!exists) throw new Error(`Pipeline ${id} not found in company ${companyId}`);
    return prisma.pipeline.delete({ where: { id } });
  }

  async updateMany(
    where: Prisma.PipelineWhereInput,
    data: Prisma.PipelineUpdateManyMutationInput,
  ) {
    return prisma.pipeline.updateMany({ where, data });
  }

  async count(where: Prisma.PipelineWhereInput) {
    return prisma.pipeline.count({ where });
  }
}

export const pipelineRepository = new PipelineRepository();
