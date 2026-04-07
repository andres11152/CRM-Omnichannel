import { AppError } from "@/utils/AppError";
import { Prisma, QueueType } from "@prisma/client";
import { queueRepository } from "@/repositories/QueueRepository";

/**
 *  QUEUE CRUD SERVICE
 */
export const queueService = {
  async findAll(companyId: string) {
    return await queueRepository.findMany({
      where: { companyId },
      include: {
        department: true,
        aiAssistant: true,
        _count: { select: { tickets: true, agents: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async create(companyId: string, data: Record<string, unknown>) {
    return await queueRepository.create({
      data: {
        name: data.name as string,
        description: data.description as string | undefined,
        type: data.type as QueueType | undefined,
        config: data.config as Prisma.InputJsonValue | undefined,
        isActive: data.isActive as boolean | undefined,
        companyId,
        departmentId: (data.departmentId as string) || null,
        aiAssistantId: (data.aiAssistantId as string) || null,
      },
    });
  },

  async update(id: string, companyId: string, data: Record<string, unknown>) {
    const queue = await queueRepository.findFirst({ where: { id, companyId } });
    if (!queue) throw new AppError("Queue not found", 404);

    const updateData: Prisma.QueueUncheckedUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name as string;
    if (data.description !== undefined)
      updateData.description = data.description as string;
    if (data.isActive !== undefined)
      updateData.isActive = data.isActive as boolean;
    if (data.type !== undefined) updateData.type = data.type as QueueType;
    if (data.config !== undefined)
      updateData.config =
        (data.config as Prisma.InputJsonValue) || Prisma.JsonNull;
    if (data.departmentId !== undefined)
      updateData.departmentId = data.departmentId as string;
    if (data.aiAssistantId !== undefined)
      updateData.aiAssistantId = data.aiAssistantId as string;

    return await queueRepository.update({ where: { id }, data: updateData });
  },

  async delete(id: string, companyId: string) {
    const queue = await queueRepository.findFirst({ where: { id, companyId } });
    if (!queue) throw new AppError("Queue not found", 404);
    await queueRepository.delete(id);
  },
};
