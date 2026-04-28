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
  companyId: string;
  name?: string;     // Búsqueda parcial
  status?: string;
  
  // Opciones de Carga
  includeCounts?: boolean; // Para rellenar contactCount y dealCount
  includeDetails?: boolean; // Traer info anidada como deals y acts (Si tu dominio lo exige)
  
  // Paginación Básica
  page?: number;     
  limit?: number;
}
