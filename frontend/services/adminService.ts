import { Company, Plan, CompanyStatus } from "../types";
import { api } from "../src/lib/axios";

// Prefix for admin routes
const ADMIN_PREFIX = "/admin";

// --- INTERFACES & DTOs ---

export interface SystemStatus {
  api: { status: string; latency: number };
  database: { status: string; latency: number };
  queues: { status: string; latency: number };
  storage: { status: string; latency: number };
}

export interface DashboardStats {
  mrr: number;
  arr: number;
  activeCompanies: number;
  churnRate: number;
  newCompaniesMonth: number;
  revenueTrend: number[];
  recentActivity: {
    icon: string;
    text: string;
    time: string;
    color: string;
  }[];
  totalUsers: number;
  totalTickets: number;
  totalMessages: number;
  topTenants: {
    id: string;
    name: string;
    plan: string;
    users: number;
    tickets: number;
    status: string;
    ids?: string; // Optional in frontend type def previously
  }[];
  arpu: number;
}

export interface CompanyMetrics {
  business: {
    mrr: number;
    plan: { name: string; price: number };
    status: string;
    daysUntilRenewal: number | null;
    isActive: boolean;
  };
  usage: {
    users: { current: number; limit: number; percentage: number };
    whatsapp: { current: number; limit: number; percentage: number };
    queues: { current: number; limit: number; percentage: number };
    aiAssistants: { current: number; limit: number };
    tickets: { thisMonth: number; lastMonth: number; growth: number };
  };
  engagement: {
    lastAdminLogin: string | null;
    conversationsThisMonth: number;
    messagesThisMonth: number;
    avgMessagesPerConversation: number;
  };
  ai: {
    resolutionRate: number;
    ticketsResolved: number;
    avgResolutionTimeSeconds: number;
  };
  health: {
    openTickets: number;
    overdueTickets: number;
    healthScore: number;
  };
}

export interface CreateCompanyDto {
  name: string;
  slug: string;
  adminEmail: string;
  password?: string;
  planId: string;
  logoUrl?: string;
  smtpPassword?: string;
}

export const adminService = {
  // --- COMPANY/TENANT MANAGEMENT ---

  async getAllCompanies(): Promise<Company[]> {
    const res = await api.get<Company[]>(`${ADMIN_PREFIX}/companies`);
    return res.data;
  },

  async updateCompanyStatus(
    companyId: string,
    status: CompanyStatus,
  ): Promise<Company> {
    const res = await api.patch<Company>(
      `${ADMIN_PREFIX}/companies/${companyId}/status`,
      { status },
    );
    return res.data;
  },

  async createCompany(data: CreateCompanyDto): Promise<Company> {
    const res = await api.post<Company>(`${ADMIN_PREFIX}/companies`, data);
    return res.data;
  },

  async updateCompany(
    companyId: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const res = await api.put<Company>(
      `${ADMIN_PREFIX}/companies/${companyId}`,
      data,
    );
    return res.data;
  },

  async generateImpersonationToken(targetCompanyId: string): Promise<{
    token: string;
    user: { id: string; email: string; role: string };
  }> {
    const res = await api.post(
      `${ADMIN_PREFIX}/companies/${targetCompanyId}/impersonate`,
    );
    return res.data;
  },

  async getCompanyMetrics(companyId: string): Promise<CompanyMetrics> {
    const res = await api.get<CompanyMetrics>(
      `${ADMIN_PREFIX}/companies/${companyId}/metrics`,
    );
    return res.data;
  },

  async getDashboardStats(): Promise<DashboardStats> {
    const res = await api.get<DashboardStats>(
      `${ADMIN_PREFIX}/dashboard-stats`,
    );
    return res.data;
  },

  // --- PLAN MANAGEMENT ---

  async getAllPlans(): Promise<Plan[]> {
    const res = await api.get<Plan[]>(`${ADMIN_PREFIX}/plans`);
    return res.data;
  },

  async savePlan(plan: Plan): Promise<Plan> {
    const res = await api.post<Plan>(`${ADMIN_PREFIX}/plans`, plan);
    return res.data;
  },

  async deletePlan(planId: string): Promise<void> {
    await api.delete(`${ADMIN_PREFIX}/plans/${planId}`);
  },

  async getSystemStatus(): Promise<SystemStatus> {
    const res = await api.get<SystemStatus>(`${ADMIN_PREFIX}/system-status`);
    return res.data;
  },

  // --- ANALYTICS & BILLING (Placeholder Types) ---
  // If strict types are needed here, we should check backend implementation.
  // For now, using 'unknown' or specific inferred types is better than 'any' implicit.

  async getFinancials(): Promise<unknown> {
    const res = await api.get(`${ADMIN_PREFIX}/analytics/financials`);
    return res.data;
  },

  async getGlobalActivity(): Promise<unknown> {
    const res = await api.get(`${ADMIN_PREFIX}/analytics/activity`);
    return res.data;
  },

  async getTenantHealth(): Promise<unknown> {
    const res = await api.get(`${ADMIN_PREFIX}/analytics/tenant-health`);
    return res.data;
    // Note: getCompanyMetrics might be replacing this on a per-tenant basis.
  },

  // Billing Operations
  async getBillingTransactions(): Promise<unknown[]> {
    const res = await api.get(`${ADMIN_PREFIX}/billing/transactions`);
    return res.data;
  },

  async retryTransaction(transactionId: string): Promise<unknown> {
    const res = await api.post(`${ADMIN_PREFIX}/billing/retry`, {
      transactionId,
    });
    return res.data;
  },
};
