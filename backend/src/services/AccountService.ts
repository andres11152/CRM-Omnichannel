import { AppError } from "@/utils/AppError";
import { planLimitsService } from "@/services/PlanLimitsService";
import { accountRepository } from "@/repositories/AccountRepository";
import TenantContextManager from "@/config/tenantContext";
export { CreateAccountDTO, UpdateAccountDTO, AccountSearchFilterDTO } from "@/types/account.types";
import { CreateAccountDTO, UpdateAccountDTO, AccountSearchFilterDTO } from "@/types/account.types";

/**
 *  ACCOUNT CRUD SERVICE (CLEAN ARCHITECTURE)
 *
 * Data access layer for CRM accounts (companies/organizations).
 */

export const accountService = {
  async findAll() {
    const filters: AccountSearchFilterDTO = {
      includeCounts: true,
    };
    return await accountRepository.findMany(filters);
  },

  async findOne(id: string) {
    const account = await accountRepository.findById(id, true);
    if (!account) {
       throw new AppError("Account not found", 404);
    }
    return account;
  },

  async create(data: CreateAccountDTO) {
    const companyId = TenantContextManager.getCompanyId();
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

    return await accountRepository.create(data);
  },

  async update(id: string, data: UpdateAccountDTO) {
    const account = await accountRepository.findById(id);

    if (!account) {
      throw new AppError("Account not found", 404);
    }

    return await accountRepository.update(id, data);
  },

  async delete(id: string) {
    const account = await accountRepository.findById(id);

    if (!account) {
      throw new AppError("Account not found", 404);
    }

    await accountRepository.delete(id);
  },
};
