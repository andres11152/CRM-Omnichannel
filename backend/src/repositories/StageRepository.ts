import { Prisma, Stage } from "@prisma/client";
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

  async update(id: string, data: Prisma.StageUpdateInput) {
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

  async delete(id: string) {
    return prisma.stage.delete({ where: { id } });
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
