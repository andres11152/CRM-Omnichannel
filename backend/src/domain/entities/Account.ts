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
  
  // Agregados opcionales para la UI
  contactCount?: number;
  dealCount?: number;
}
