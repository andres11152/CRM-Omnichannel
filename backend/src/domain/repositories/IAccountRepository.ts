import { AccountEntity } from "../entities/Account";
import { CreateAccountDTO, UpdateAccountDTO, AccountSearchFilterDTO } from "../dtos/AccountDTOs";

export interface IAccountRepository {
  findMany(filters: AccountSearchFilterDTO): Promise<AccountEntity[]>;
  findById(id: string, companyId: string, includeDetails?: boolean): Promise<AccountEntity | unknown | null>; 
  create(companyId: string, data: CreateAccountDTO): Promise<AccountEntity>;
  update(id: string, companyId: string, data: UpdateAccountDTO): Promise<AccountEntity>;
  delete(id: string): Promise<void>;
}
