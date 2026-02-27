import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { cacheService } from "@/services/cacheService";
import { planLimitsService } from "@/services/planLimitsService";
import { Prisma } from "@prisma/client";
import { workflowRepository } from "@/repositories/WorkflowRepository";

/**
 * ⚡ FLOW (WORKFLOW) CRUD SERVICE
 *
 * Data access layer for automation workflows.
 * Handles CRUD, toggle, duplicate, plan limits, and cache invalidation.
 */

interface CreateFlowDTO {
  name: string;
  triggerType?: string;
  triggerConfig?: Prisma.InputJsonValue;
  nodes?: Prisma.InputJsonValue;
  edges?: Prisma.InputJsonValue;
  isActive?: boolean;
}

interface UpdateFlowDTO {
  name?: string;
  triggerType?: string;
  triggerConfig?: Prisma.InputJsonValue;
  nodes?: Prisma.InputJsonValue;
  edges?: Prisma.InputJsonValue;
  isActive?: boolean;
}

export const flowService = {
  async findAll(companyId: string) {
    return await workflowRepository.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
  },

  async findOne(id: string, companyId: string) {
    return await workflowRepository.findFirst({
      where: { id, companyId },
    });
  },

  async create(companyId: string, data: CreateFlowDTO) {
    const initActive = data.isActive !== undefined ? data.isActive : true;

    if (initActive) {
      const canCreate = await planLimitsService.canCreateResource(
        companyId,
        "workflows",
      );
      if (!canCreate) {
        throw new AppError(
          "Has alcanzado el límite de workflows activos de tu plan",
          403,
        );
      }
    }

    const flow = await workflowRepository.create({
      data: {
        companyId,
        name: data.name,
        triggerType: data.triggerType || "KEYWORD",
        triggerConfig: data.triggerConfig || {},
        nodes: data.nodes || [],
        edges: data.edges || [],
        isActive: initActive,
      },
    });

    Logger.info(`[Flow] Created: ${flow.name} (${flow.id})`);
    return flow;
  },

  async update(id: string, companyId: string, data: UpdateFlowDTO) {
    const existing = await workflowRepository.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new AppError("Flow not found", 404);
    }

    const updated = await workflowRepository.update({
      where: { id },
      data: {
        name: data.name,
        triggerType: data.triggerType,
        triggerConfig: data.triggerConfig,
        nodes: data.nodes,
        edges: data.edges,
        isActive: data.isActive,
      },
    });

    await cacheService.delete(`workflow:${id}`);
    Logger.info(`[Flow] Updated: ${updated.name} (${updated.id})`);
    return updated;
  },

  async delete(id: string, companyId: string) {
    const existing = await workflowRepository.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new AppError("Flow not found", 404);
    }

    await workflowRepository.delete(id);
    await cacheService.delete(`workflow:${id}`);
    Logger.info(`[Flow] Deleted: ${existing.name} (${id})`);
  },

  async toggle(id: string, companyId: string) {
    const flow = await workflowRepository.findFirst({
      where: { id, companyId },
    });

    if (!flow) {
      throw new AppError("Flow not found", 404);
    }

    // Enforce limit when activating
    if (!flow.isActive) {
      const canActivate = await planLimitsService.canCreateResource(
        companyId,
        "workflows",
      );
      if (!canActivate) {
        throw new AppError(
          "Has alcanzado el límite de workflows activos de tu plan",
          403,
        );
      }
    }

    const updated = await workflowRepository.update({
      where: { id },
      data: { isActive: !flow.isActive },
    });

    await cacheService.delete(`workflow:${id}`);
    return updated;
  },

  async duplicate(id: string, companyId: string) {
    const original = await workflowRepository.findFirst({
      where: { id, companyId },
    });

    if (!original) {
      throw new AppError("Flow not found", 404);
    }

    const duplicate = await workflowRepository.create({
      data: {
        companyId,
        name: `${original.name} (Copia)`,
        triggerType: original.triggerType,
        triggerConfig: original.triggerConfig,
        nodes: original.nodes,
        edges: original.edges,
        isActive: false,
      },
    });

    Logger.info(
      `[Flow] Duplicated: ${original.name} -> ${duplicate.name} (${duplicate.id})`,
    );
    return duplicate;
  },
};
