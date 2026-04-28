import { AppError } from "@/utils/AppError";
import { planLimitsService } from "@/services/PlanLimitsService";
import { accountRepository } from "@/repositories/AccountRepository";
export { CreateAccountDTO, UpdateAccountDTO, AccountSearchFilterDTO } from "@/domain/dtos/AccountDTOs";
import { CreateAccountDTO, UpdateAccountDTO, AccountSearchFilterDTO } from "@/domain/dtos/AccountDTOs";

/**
 *  ACCOUNT CRUD SERVICE (CLEAN ARCHITECTURE)
 *
 * Data access layer for CRM accounts (companies/organizations).
 */

export const accountService = {
  async findAll(companyId: string) {
    const filters: AccountSearchFilterDTO = {
      companyId,
      includeCounts: true,
    };
    return await accountRepository.findMany(filters);
  },

  async findOne(id: string, companyId: string) {
    const account = await accountRepository.findById(id, companyId, true);
    if (!account) {
       throw new AppError("Account not found", 404);
    }
    return account;
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

    return await accountRepository.create(companyId, data);
  },

  async update(id: string, companyId: string, data: UpdateAccountDTO) {
    const account = await accountRepository.findById(id, companyId);

    if (!account) {
      throw new AppError("Account not found", 404);
    }

    return await accountRepository.update(id, companyId, data);
  },

  async delete(id: string, companyId: string) {
    const account = await accountRepository.findById(id, companyId);

    if (!account) {
      throw new AppError("Account not found", 404);
    }

    await accountRepository.delete(id);
  },
};
