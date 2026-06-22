import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export class StageRepository {
  async findMany(pipelineId: string) {
    return prisma.stage.findMany({
      where: { pipelineId },
      include: {
        _count: {
          select: { deals: true },
        },
      },
      orderBy: { order: "asc" },
    });
  }

  async findById(id: string, pipelineId?: string) {
    return prisma.stage.findFirst({
      where: { id, pipelineId },
      include: {
        _count: {
          select: { deals: true },
        },
      },
    });
  }

  async create(data: Prisma.StageCreateInput) {
    return prisma.stage.create({
      data,
      include: {
        _count: {
          select: { deals: true },
        },
      },
    });
  }

  async update(id: string, pipelineId: string, data: Prisma.StageUpdateInput) {
    const exists = await prisma.stage.findFirst({ where: { id, pipelineId } });
    if (!exists) throw new Error(`Stage ${id} not found in pipeline ${pipelineId}`);

    return prisma.stage.update({
      where: { id },
      data,
      include: {
        _count: {
          select: { deals: true },
        },
      },
    });
  }

  async delete(id: string, pipelineId: string) {
    const exists = await prisma.stage.findFirst({ where: { id, pipelineId } });
    if (!exists) throw new Error(`Stage ${id} not found in pipeline ${pipelineId}`);

    return prisma.stage.delete({ where: { id } });
  }

  async updateOrders(pipelineId: string, stages: { id: string; order: number }[]) {
    const stageIds = stages.map((s) => s.id);
    const count = await prisma.stage.count({
      where: {
        id: { in: stageIds },
        pipelineId,
      },
    });

    if (count !== stages.length) {
      throw new Error("One or more stage IDs are invalid or belong to a different pipeline");
    }

    return prisma.$transaction(
      stages.map((stage) =>
        prisma.stage.update({
          where: { id: stage.id },
          data: { order: stage.order },
        })
      )
    );
  }

  async updateMany(
    where: Prisma.StageWhereInput,
    data: Prisma.StageUpdateManyMutationInput,
  ) {
    return prisma.stage.updateMany({ where, data });
  }

  async getMaxOrder(pipelineId: string) {
    return prisma.stage.aggregate({
      where: { pipelineId },
      _max: { order: true },
    });
  }

  async count(where: Prisma.StageWhereInput) {
    return prisma.stage.count({ where });
  }
}

export const stageRepository = new StageRepository();
