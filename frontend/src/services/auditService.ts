import { api } from "@/lib/axios";

export interface AuditLog {
  id: string;
  companyId: string;
  companyName: string;
  userId: string | null;
  userName: string;
  action: string;
  entity: string;
  entityId: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditFilter {
  companyId?: string;
  userId?: string;
  entity?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface AuditResponse {
  logs: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}

export const auditService = {
  async getGlobalLogs(filter: AuditFilter): Promise<AuditResponse> {
    const res = await api.get<AuditResponse>("/admin/audit/logs", {
      params: filter
    });
    return res.data;
  }
};
