import { AppError } from "@/utils/AppError";
import { planLimitsService } from "@/services/PlanLimitsService";
import { accountRepository } from "@/repositories/AccountRepository";

/**
 *  ACCOUNT CRUD SERVICE
 *
 * Data access layer for CRM accounts (companies/organizations).
 */

export interface CreateAccountDTO {
  name: string;
  industry?: string;
  website?: string;
  size?: string;
  address?: string;
  status?: string;
}

export const accountService = {
  async findAll(companyId: string) {
    return await accountRepository.findMany({
      where: { companyId },
      include: {
        _count: {
          select: { contacts: true, deals: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  },

  async findOne(id: string, companyId: string) {
    return await accountRepository.findFirst({
      where: { id, companyId },
      include: {
        contacts: true,
        deals: true,
        activities: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { createdBy: { select: { name: true, email: true } } },
        },
      },
    });
  },

  async create(companyId: string, data: CreateAccountDTO) {
    const canCreate = await planLimitsService.canCreateResource(
      companyId,
      "companies",
    );
    if (!canCreate) {
      throw new AppError(
        "Has alcanzado el límite de empresas/cuentas de tu plan",
        403,
      );
    }

    return await accountRepository.create({
      data: {
        companyId,
        name: data.name,
        industry: data.industry,
        website: data.website,
        size: data.size,
        address: data.address,
        status: data.status || "ACTIVE",
      },
    });
  },

  async update(id: string, companyId: string, data: Record<string, unknown>) {
    const account = await accountRepository.findFirst({
      where: { id, companyId },
    });

    if (!account) {
      throw new AppError("Account not found", 404);
    }

    return await accountRepository.update({
      where: { id },
      data,
    });
  },

  async delete(id: string, companyId: string) {
    const account = await accountRepository.findFirst({
      where: { id, companyId },
    });

    if (!account) {
      throw new AppError("Account not found", 404);
    }

    await accountRepository.delete(id);
  },
};
