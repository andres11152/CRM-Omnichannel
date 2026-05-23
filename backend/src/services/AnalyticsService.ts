import {
  analyticsRepository,
  AgentPerformanceQueryResult,
} from "@/repositories/AnalyticsRepository";
import { ticketRepository } from "@/repositories/TicketRepository";
import { companyRepository } from "@/repositories/CompanyRepository";
import { exportService } from "@/services/ExportService";
import dayjs from "dayjs";

// --- DTOs ---

export interface FinancialAnalyticsDTO {
  mrr: number;
  distribution: { name: string; value: number; color: string }[];
  trend: { name: string; value: number; revenue: number }[];
}

export interface AgentPerformanceDTO {
  agentId?: string;
  name: string;
  email: string;
  role?: string;
  totalTickets: number;
  resolvedTickets: number;
  avgResolutionTime: number; // minutes
}

export interface TagAnalyticsDTO {
  tag: string;
  count: number;
  color: string;
}

export interface HeatmapDataDTO {
  day: number;
  hour: number;
  value: number;
}

export interface ExportResultDTO {
  downloadUrl: string;
  format: string;
  recordCount: number;
}

export interface ActivityLogDTO {
  id: string;
  action: string;
  entity: string;
  description: string;
  timestamp: string;
  user?: { name: string };
  company?: { name: string };
  metadata?: { severity: "info" | "success" | "warning" | "error" | "default" };
}

// --- SERVICE ---

export class AnalyticsService {
  /**
   * Get Financial Stats (MRR, Growth)
   */
  async getFinancialAnalytics(): Promise<FinancialAnalyticsDTO> {
    const activeCompanies = await analyticsRepository.getFinancialData();

    const mrr = activeCompanies.reduce(
      (total, c) => total + (c.plan?.price || 0),
      0,
    );

    const distributionRaw = await analyticsRepository.getCompanyCountByPlan();
    const plans = await analyticsRepository.getPlans();
    const planMap = new Map(plans.map((p) => [p.id, p]));

    const distribution = distributionRaw.map((item) => {
      const plan = planMap.get(item.planId || "");
      const name = plan?.name || "Unknown";
      return {
        name,
        value: item._count.planId,
        color: this.getPlanColor(name),
      };
    });

    const sixMonthsAgo = dayjs().subtract(5, "month").startOf("month").toDate();
    const newCompanies =
      await analyticsRepository.getNewCompanies(sixMonthsAgo);

    const trend = this.generateMonthlyTrend(newCompanies);

    return { mrr, distribution, trend };
  }

  /**
   * Heatmap Data
   */
  async getHeatmap(
    companyId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<HeatmapDataDTO[]> {
    const start = startDate || dayjs().subtract(30, "day").toDate();
    const end = endDate || new Date();

    const results = await analyticsRepository.getHeatmap(companyId, start, end);

    return results.map((r) => ({
      day: r.day,
      hour: r.hour,
      value: Number(r.value),
    }));
  }

  /**
   * Agent Performance Logic
   */
  async getAgentPerformance(
    companyId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<AgentPerformanceDTO[]> {
    const start = startDate || dayjs().subtract(30, "day").toDate();
    const end = endDate || new Date();

    const results = await analyticsRepository.getAgentPerformance(
      companyId,
      start,
      end,
    );

    const formattedResults: AgentPerformanceDTO[] = results.map((r: AgentPerformanceQueryResult) => ({
      agentId: r.agentId,
      name: r.name,
      email: r.email,
      role: r.role,
      totalTickets: r.totalTickets,
      resolvedTickets: r.resolvedTickets,
      avgResolutionTime: r.avgResolutionTime
        ? Math.round(r.avgResolutionTime)
        : 0,
    }));

    // Count unassigned tickets in that range
    const unassignedTickets = await ticketRepository.count({
      where: {
        assignedToId: null,
        createdAt: { gte: start, lte: end },
        deletedAt: null,
      },
    }, companyId);

    const unassignedResolved = await ticketRepository.count({
      where: {
        assignedToId: null,
        status: { in: ["RESOLVED", "CLOSED"] },
        createdAt: { gte: start, lte: end },
        deletedAt: null,
      },
    }, companyId);

    // If there are unassigned tickets, append a virtual agent "Sin Asignar"
    if (unassignedTickets > 0) {
      formattedResults.push({
        agentId: "unassigned",
        name: "Sin Asignar",
        email: "cola-de-espera@sentrycrm.cloud",
        role: "QUEUE",
        totalTickets: unassignedTickets,
        resolvedTickets: unassignedResolved,
        avgResolutionTime: 0,
      });
    }

    return formattedResults;
  }

  /**
   * Tag Usage Analytics
   */
  async getTagAnalytics(
    companyId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<TagAnalyticsDTO[]> {
    const start = startDate || dayjs().subtract(30, "day").toDate();
    const end = endDate || new Date();

    const conversations = await analyticsRepository.getConversationsWithTags(
      companyId,
      start,
      end,
    );

    const tagCounts: Record<string, number> = {};
    conversations.forEach((c) =>
      c.tags.forEach((t) => (tagCounts[t] = (tagCounts[t] || 0) + 1)),
    );

    const existingTags = await analyticsRepository.getTags(companyId);
    const colorMap = new Map(existingTags.map((t) => [t.name, t.color]));

    return Object.entries(tagCounts)
      .map(([name, value]) => ({
        tag: name,
        count: value,
        color: colorMap.get(name) || "#6B7280",
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * Mock Global Activity
   */
  /**
   * Real Global Activity Feed
   * Aggregates events from multiple tables to show system-wide activity.
   */
  async getGlobalActivity(): Promise<ActivityLogDTO[]> {
    const data = await analyticsRepository.getGlobalActivityData();
    const activities: ActivityLogDTO[] = [];

    // Transform Companies
    data.companies.forEach((c) => {
      activities.push({
        id: `comp_${c.id}`,
        action: "CREATE",
        entity: "Company",
        description: `Nueva empresa registrada: ${c.name}`,
        timestamp: c.createdAt.toISOString(),
        user: { name: "System" },
        company: { name: c.name },
        metadata: { severity: "success" },
      });
    });

    // Transform Tickets
    data.tickets.forEach((t) => {
      activities.push({
        id: `tick_${t.id}`,
        action: "CREATE",
        entity: "Ticket",
        description: `Nuevo ticket de soporte: ${t.subject}`,
        timestamp: t.createdAt.toISOString(),
        user: { name: t.createdBy?.name || "Cliente" },
        company: { name: t.company?.name || "N/A" },
        metadata: { severity: "info" },
      });
    });

    // Transform Transactions
    data.transactions.forEach((tr) => {
      activities.push({
        id: `trans_${tr.id}`,
        action: "PAYMENT",
        entity: "Billing",
        description: `Pago procesado: ${tr.description} (${tr.amount / 100} ${tr.currency})`,
        timestamp: tr.createdAt.toISOString(),
        user: { name: "Stripe Gateway" },
        company: { name: tr.company?.name || "N/A" },
        metadata: { severity: tr.status === "succeeded" ? "success" : "error" },
      });
    });

    // Transform Users
    data.users.forEach((u) => {
      activities.push({
        id: `user_${u.id}`,
        action: "CREATE",
        entity: "User",
        description: `Nuevo usuario en el sistema: ${u.name}`,
        timestamp: u.createdAt.toISOString(),
        user: { name: "Admin" },
        company: { name: u.company?.name || "N/A" },
        metadata: { severity: "info" },
      });
    });

    return activities
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, 20);
  }

  async getTenantHealth() {
    const tenants = await analyticsRepository.getTenantsHealthData();

    return tenants
      .map((t) => {
        let score = 70; // Baseline
        const factors: string[] = [];

        // 1. Plan Weight
        const isEnterprise = t.plan?.name.toLowerCase().includes("enterprise");
        if (isEnterprise) {
          score += 10;
          factors.push("Plan Enterprise (+10)");
        }

        // 2. Ticket Load
        const openTickets = t._count.tickets;
        if (openTickets > 10) {
          score -= 30;
          factors.push(`Alta carga de soporte: ${openTickets} tickets (-30)`);
        } else if (openTickets > 0) {
          score -= 5;
          factors.push(`Incidentes activos: ${openTickets} (-5)`);
        } else {
          score += 10;
          factors.push("Sin tickets pendientes (+10)");
        }

        // 3. User Adoption
        const userCount = t._count.users;
        if (userCount > 5) {
          score += 10;
          factors.push(`Buena adopción: ${userCount} usuarios (+10)`);
        }

        score = Math.max(0, Math.min(100, score));
        let healthStatus: "healthy" | "neutral" | "critical" = "neutral";
        if (score >= 85) healthStatus = "healthy";
        if (score < 50) healthStatus = "critical";

        return {
          id: t.id,
          name: t.name,
          logo: t.logoUrl || "",
          plan: t.plan?.name || "N/A",
          mrr: t.plan?.price || 0,
          healthScore: score,
          healthStatus,
          factors,
          openTickets,
          status: t.status,
        };
      })
      .sort((a, b) => b.mrr - a.mrr);
  }

  // --- EXPORT HELPERS ---
  async generateAgentExport(
    companyId: string,
    filters: { startDate?: Date; endDate?: Date },
    format: string,
    userName: string,
  ): Promise<ExportResultDTO> {
    const data = await this.getAgentPerformance(
      companyId,
      filters.startDate,
      filters.endDate,
    );
    const company = await companyRepository.findById(companyId);

    const csvRecords = data.map((d) => ({
      name: d.name,
      email: d.email,
      role: d.role,
      totalTickets: d.totalTickets,
      resolvedTickets: d.resolvedTickets,
      pendingTickets: d.totalTickets - d.resolvedTickets,
      avgResolutionTimeMinutes: d.avgResolutionTime,
      resolutionRate:
        d.totalTickets > 0
          ? Math.round((d.resolvedTickets / d.totalTickets) * 100)
          : 0,
    }));

    const exportData = {
      headers: [
        { id: "name", title: "Agente" },
        { id: "email", title: "Email" },
        { id: "role", title: "Rol" },
        { id: "totalTickets", title: "Tickets Totales" },
        { id: "resolvedTickets", title: "Resueltos" },
        { id: "pendingTickets", title: "Pendientes" },
        { id: "avgResolutionTimeMinutes", title: "Tiempo Promedio (min)" },
        { id: "resolutionRate", title: "Tasa Resolución (%)" },
      ],
      records: csvRecords,
      metadata: {
        title: "Reporte de Desempeño de Agentes",
        companyName: company?.name || "CRM",
        dateRange: `${dayjs(filters.startDate).format("DD/MM/YYYY")} - ${dayjs(filters.endDate).format("DD/MM/YYYY")}`,
        generatedBy: userName,
        totalRecords: data.length,
      },
    };

    const prefix = "agent_performance";
    const result =
      format === "pdf"
        ? await exportService.generatePDF(companyId, exportData, prefix)
        : await exportService.generateCSV(companyId, exportData, prefix);
    return { downloadUrl: result.filePath, format, recordCount: data.length };
  }

  async generateTicketExport(
    companyId: string,
    filters: { startDate?: Date; endDate?: Date },
    format: string,
    userName: string,
  ): Promise<ExportResultDTO> {
    const start = filters.startDate || dayjs().subtract(30, "day").toDate();
    const end = filters.endDate || new Date();

    const tickets = await ticketRepository.getTicketsForExport(
      companyId,
      start,
      end,
    );
    const company = await companyRepository.findById(companyId);

    const records = tickets.map((t) => ({
      ticketNumber: `#${t.ticketNumber}`,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      assignedTo: t.assignedTo?.name || "Sin asignar",
      createdBy: t.createdBy?.name || t.createdBy?.email || "Sistema",
      createdAt: dayjs(t.createdAt).format("DD/MM/YYYY HH:mm"),
      resolvedAt: t.resolvedAt
        ? dayjs(t.resolvedAt).format("DD/MM/YYYY HH:mm")
        : "Pendiente",
    }));

    const exportData = {
      headers: [
        { id: "ticketNumber", title: "# Ticket" },
        { id: "subject", title: "Asunto" },
        { id: "status", title: "Estado" },
        { id: "priority", title: "Prioridad" },
        { id: "assignedTo", title: "Asignado a" },
        { id: "createdBy", title: "Creado por" },
        { id: "createdAt", title: "Fecha Creación" },
        { id: "resolvedAt", title: "Fecha Resolución" },
      ],
      records,
      metadata: {
        title: "Reporte de Tickets",
        companyName: company?.name || "CRM",
        dateRange: `${dayjs(start).format("DD/MM/YYYY")} - ${dayjs(end).format("DD/MM/YYYY")}`,
        generatedBy: userName,
        totalRecords: records.length,
      },
    };

    const prefix = "ticket_analytics";
    const result =
      format === "pdf"
        ? await exportService.generatePDF(companyId, exportData, prefix)
        : await exportService.generateCSV(companyId, exportData, prefix);
    return {
      downloadUrl: result.filePath,
      format,
      recordCount: records.length,
    };
  }

  // --- PRIVATE HELPERS ---
  private getPlanColor(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes("enterprise")) return "#6366f1";
    if (lower.includes("pro")) return "#8b5cf6";
    if (lower.includes("free") || lower.includes("básico")) return "#10b981";
    return "#94a3b8";
  }

  private generateMonthlyTrend(companies: { createdAt: Date }[]) {
    const months: Record<string, number> = {};
    for (let i = 5; i >= 0; i--)
      months[dayjs().subtract(i, "month").format("MMM")] = 0;

    companies.forEach((c) => {
      const m = dayjs(c.createdAt).format("MMM");
      if (months[m] !== undefined) months[m]++;
    });

    // Estimate revenue based on average ticket ($150 per enterprise client estimate)
    // In a real enterprise scenario, we'd pull from billing_transactions
    return Object.entries(months).map(([name, value]) => ({
      name,
      value,
      revenue: value * 150, // More realistic enterprise MRR weight
    }));
  }
}

export const analyticsService = new AnalyticsService();
