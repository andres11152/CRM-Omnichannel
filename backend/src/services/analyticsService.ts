import {
  analyticsRepository,
  AgentPerformanceQueryResult,
} from "@/repositories/AnalyticsRepository";
import { ticketRepository } from "@/repositories/TicketRepository";
import { companyRepository } from "@/repositories/CompanyRepository";
import { exportService } from "@/services/exportService";
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

    return results.map((r: AgentPerformanceQueryResult) => ({
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
  getGlobalActivity() {
    const actions = ["CREATE", "UPDATE", "DELETE", "LOGIN", "PAYMENT", "ALERT"];
    const entities = [
      "Contact",
      "Ticket",
      "Deal",
      "Subscription",
      "User",
      "System",
    ];
    const names = [
      "Andrés B.",
      "Carlos R.",
      "Ana M.",
      "Bot System",
      "Webservice",
      "Soporte N1",
    ];
    const companies = [
      "Reply Corp",
      "TechSolutions",
      "Demo Inc.",
      "Acme Ltda",
      "Global Services",
    ];

    const getSeverity = (action: string) => {
      if (action === "DELETE" || action === "ALERT") return "error";
      if (action === "UPDATE" || action === "LOGIN") return "info";
      if (action === "CREATE" || action === "PAYMENT") return "success";
      return "default";
    };
    const getDescription = (action: string, entity: string) => {
      if (action === "LOGIN")
        return "Inició sesión en el portal administrativo";
      if (action === "CREATE") return `Creó un nuevo ${entity} en el sistema`;
      if (action === "UPDATE") return `Modificó la configuración de ${entity}`;
      if (action === "DELETE") return `Eliminó permanentemente un ${entity}`;
      if (action === "PAYMENT")
        return "Procesó un pago de renovación de Plan Pro";
      if (action === "ALERT") return `Detectó una anomalía en ${entity}`;
      return "Ejecutó una acción del sistema";
    };

    return Array.from({ length: 20 }).map((_, i) => {
      const action = actions[Math.floor(Math.random() * actions.length)];
      const entity = entities[Math.floor(Math.random() * entities.length)];
      return {
        id: `log_${Date.now()}_${i}`,
        action,
        entity,
        description: getDescription(action, entity),
        timestamp: new Date(
          Date.now() - i * 1000 * 60 * (2 + Math.random() * 10),
        ).toISOString(),
        user: { name: names[Math.floor(Math.random() * names.length)] },
        company: {
          name: companies[Math.floor(Math.random() * companies.length)],
        },
        metadata: { severity: getSeverity(action) },
      };
    });
  }

  getTenantHealth() {
    const mockTenants = [
      {
        id: "c1",
        name: "Apex Innovations",
        logo: "",
        plan: "Enterprise",
        mrr: 3500,
        lastLoginDays: 0,
        openTickets: 1,
        status: "ACTIVE",
      },
      {
        id: "c2",
        name: "Solaris start-up",
        logo: "",
        plan: "Pro",
        mrr: 450,
        lastLoginDays: 3,
        openTickets: 0,
        status: "ACTIVE",
      },
      {
        id: "c3",
        name: "Omega Retail",
        logo: "",
        plan: "Basic",
        mrr: 99,
        lastLoginDays: 25,
        openTickets: 8,
        status: "ACTIVE",
      },
      {
        id: "c4",
        name: "BlueOcean Consulting",
        logo: "",
        plan: "Pro",
        mrr: 850,
        lastLoginDays: 1,
        openTickets: 2,
        status: "ACTIVE",
      },
      {
        id: "c5",
        name: "Rapid Logistics",
        logo: "",
        plan: "Enterprise",
        mrr: 2100,
        lastLoginDays: 5,
        openTickets: 12,
        status: "ACTIVE",
      },
    ];

    return mockTenants
      .map((t) => {
        let score = 60;
        const factors: string[] = [];
        if (t.lastLoginDays <= 1) {
          score += 25;
          factors.push("Alta actividad reciente (+25)");
        } else if (t.lastLoginDays > 14) {
          score -= 30;
          factors.push('Usuario "fantasma" > 14d (-30)');
        }

        if (t.openTickets === 0) {
          score += 10;
          factors.push("Sin incidentes técnicos (+10)");
        } else if (t.openTickets > 5) {
          score -= 40;
          factors.push("Múltiples problemas reportados (-40)");
        }

        if (t.plan === "Enterprise") {
          score += 5;
          factors.push("Contrato Enterprise estable (+5)");
        }

        score = Math.max(0, Math.min(100, score));
        let healthStatus: "healthy" | "neutral" | "critical" = "neutral";
        if (score >= 80) healthStatus = "healthy";
        if (score < 50) healthStatus = "critical";

        return { ...t, healthScore: score, healthStatus, factors };
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
    return Object.entries(months).map(([name, value]) => ({
      name,
      value,
      revenue: value * 49,
    }));
  }
}

export const analyticsService = new AnalyticsService();
