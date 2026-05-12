export interface AccountEntity {
  id: string;
  companyId: string;
  name: string;
  industry?: string | null;
  website?: string | null;
  size?: string | null;
  address?: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Optional additions for UI
  contactCount?: number;
  dealCount?: number;
}

export interface CreateAccountDTO {
  name: string;
  industry?: string;
  website?: string;
  size?: string;
  address?: string;
  status?: string;
}

export interface UpdateAccountDTO {
  name?: string;
  industry?: string;
  website?: string;
  size?: string;
  address?: string;
  status?: string;
}

export interface AccountSearchFilterDTO {
  name?: string;     // Partial search
  status?: string;
  
  // Load Options
  includeCounts?: boolean; // To populate contactCount and dealCount
  includeDetails?: boolean; // Fetch nested info like deals and acts (if domain requires it)
  
  // Basic Pagination
  page?: number;     
  limit?: number;
}

export interface IAccountRepository {
  findMany(filters: AccountSearchFilterDTO): Promise<AccountEntity[]>;
  findById(id: string, includeDetails?: boolean): Promise<AccountEntity | unknown | null>; 
  create(data: CreateAccountDTO): Promise<AccountEntity>;
  update(id: string, data: UpdateAccountDTO): Promise<AccountEntity>;
  delete(id: string): Promise<void>;
}
