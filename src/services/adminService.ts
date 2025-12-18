import type { Company, Plan, CompanyStatus, Prisma } from "@prisma/client";
import { Buffer } from "buffer";
import { prisma } from "@/config/prisma";
import { signToken } from "@/controllers/authController";
import { cacheService } from "@/services/cacheService";

export const adminService = {
  // --- TENANT MANAGEMENT ---

  async getAllCompanies() {
    // Cache for 2 minutes (companies don't change often)
    return cacheService.wrap(
      "admin:companies:all",
      async () => {
        return prisma.company.findMany({
          include: {
            users: {
              where: { role: "ADMIN" },
              select: { email: true },
              take: 1,
            },
          },
        });
      },
      120 // 2 minutes TTL
    );
  },

  async updateCompanyStatus(companyId: string, status: CompanyStatus) {
    // La lógica ahora usa los valores del enum de Prisma
    const isActive = status === "ACTIVE" || status === "TRIAL";

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: { status, isActive },
    });

    // Invalidate cache
    await cacheService.delete("admin:companies:all");
    await cacheService.invalidateCompany(companyId);

    return updated;
  },

  async createCompany(data: Prisma.CompanyCreateInput) {
    const newCompany = await prisma.company.create({
      data: data,
    });
    console.log(`[Admin] Created Company: ${newCompany.name}.`);
    return newCompany;
  },

  async updateCompany(
    companyId: string,
    data: {
      name?: string;
      slug?: string;
      planId?: string;
      status?: CompanyStatus;
      subscriptionEndsAt?: Date | string | null;
    }
  ) {
    console.log(
      `[AdminService] Updating company ${companyId}. Data:`,
      JSON.stringify(data)
    );
    const updated = await prisma.company.update({
      where: { id: companyId },
      data: {
        name: data.name,
        slug: data.slug,
        planId: data.planId,
        status: data.status,
        subscriptionEndsAt: data.subscriptionEndsAt
          ? new Date(data.subscriptionEndsAt)
          : data.subscriptionEndsAt,
        isActive: data.status
          ? data.status === "ACTIVE" || data.status === "TRIAL"
          : undefined,
      },
      include: { plan: true },
    });

    // Invalidate cache
    await cacheService.delete("admin:companies:all");
    await cacheService.invalidateCompany(companyId);

    return updated;
  },

  // --- PLAN MANAGEMENT ---

  async getAllPlans() {
    return prisma.plan.findMany();
  },

  async savePlan(plan: Plan) {
    return prisma.plan.upsert({
      where: { id: plan.id },
      update: {
        // Especificamos explícitamente los campos a actualizar
        name: plan.name,
        price: plan.price,
        config: plan.config as Prisma.InputJsonValue,
        // Map quotas from config to columns (Adapter Pattern)
        storageLimitGb: (plan.config as any)?.storage_limit_gb
          ? Number((plan.config as any).storage_limit_gb)
          : null,
        maxContacts: (plan.config as any)?.max_contacts
          ? Number((plan.config as any).max_contacts)
          : null,
        maxCompanies: (plan.config as any)?.max_companies
          ? Number((plan.config as any).max_companies)
          : null,
        maxWorkflows: (plan.config as any)?.max_workflows
          ? Number((plan.config as any).max_workflows)
          : null,
      },
      create: {
        // Construimos el objeto de creación solo con los campos necesarios
        id: plan.id,
        name: plan.name,
        price: plan.price,
        config: plan.config as Prisma.InputJsonValue,
        storageLimitGb: (plan.config as any)?.storage_limit_gb
          ? Number((plan.config as any).storage_limit_gb)
          : null,
        maxContacts: (plan.config as any)?.max_contacts
          ? Number((plan.config as any).max_contacts)
          : null,
        maxCompanies: (plan.config as any)?.max_companies
          ? Number((plan.config as any).max_companies)
          : null,
        maxWorkflows: (plan.config as any)?.max_workflows
          ? Number((plan.config as any).max_workflows)
          : null,
      },
    });
  },

  async deletePlan(planId: string) {
    return prisma.plan.delete({ where: { id: planId } });
  },

  // --- SECURITY: IMPERSONATION ---

  async getCompanyMetrics(companyId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Get company with plan
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { plan: true },
    });

    if (!company) {
      throw new Error("Company not found");
    }

    // === BUSINESS METRICS ===
    const planPrice = company.plan?.price || 0;
    const mrr = planPrice; // Monthly Recurring Revenue
    const daysUntilRenewal = company.subscriptionEndsAt
      ? Math.ceil(
          (company.subscriptionEndsAt.getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : null;

    // === USAGE METRICS (with limits) ===
    const [
      totalUsers,
      activeWhatsAppSessions,
      totalQueues,
      ticketsThisMonth,
      ticketsLastMonth,
      aiAssistants,
    ] = await Promise.all([
      prisma.user.count({ where: { companyId } }),
      prisma.whatsAppSession.count({
        where: { companyId, status: "CONNECTED" },
      }),
      prisma.queue.count({ where: { companyId } }),
      prisma.ticket.count({
        where: { companyId, createdAt: { gte: startOfMonth } },
      }),
      prisma.ticket.count({
        where: {
          companyId,
          createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        },
      }),
      prisma.aIAssistant.count({ where: { companyId } }),
    ]);

    const planLimits = company.plan?.config as any;
    const usagePercentages = {
      users:
        planLimits?.max_users > 0
          ? (totalUsers / planLimits.max_users) * 100
          : 0,
      whatsapp:
        planLimits?.max_whatsapp_sessions > 0
          ? (activeWhatsAppSessions / planLimits.max_whatsapp_sessions) * 100
          : 0,
      queues:
        planLimits?.max_queues > 0
          ? (totalQueues / planLimits.max_queues) * 100
          : 0,
    };

    const ticketGrowth =
      ticketsLastMonth > 0
        ? ((ticketsThisMonth - ticketsLastMonth) / ticketsLastMonth) * 100
        : 0;

    // === ENGAGEMENT METRICS ===
    const lastAdminLogin = await prisma.user.findFirst({
      where: { companyId, role: "ADMIN" },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    });

    const conversationsThisMonth = await prisma.conversation.count({
      where: { companyId, createdAt: { gte: startOfMonth } },
    });

    const messagesThisMonth = await prisma.message.count({
      where: {
        conversation: { companyId },
        createdAt: { gte: startOfMonth },
      },
    });

    // === AI METRICS ===
    const resolvedTickets = await prisma.ticket.findMany({
      where: {
        companyId,
        status: "RESOLVED",
        resolvedAt: { not: null },
        createdAt: { gte: startOfMonth },
      },
      include: { queue: true },
    });

    const totalResolved = resolvedTickets.length;
    let aiResolvedCount = 0;
    let totalResolutionTime = 0;

    for (const ticket of resolvedTickets) {
      if (ticket.queue?.type === "AI") {
        aiResolvedCount++;
      }
      if (ticket.resolvedAt) {
        const diff = ticket.resolvedAt.getTime() - ticket.createdAt.getTime();
        totalResolutionTime += diff;
      }
    }

    const aiResolutionRate =
      totalResolved > 0 ? (aiResolvedCount / totalResolved) * 100 : 0;
    const avgResolutionTimeSeconds =
      totalResolved > 0 ? totalResolutionTime / totalResolved / 1000 : 0;

    // === HEALTH METRICS ===
    const openTickets = await prisma.ticket.count({
      where: { companyId, status: { in: ["OPEN", "IN_PROGRESS"] } },
    });

    const overdueTickets = await prisma.ticket.count({
      where: {
        companyId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
        createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) }, // Older than 24h
      },
    });

    return {
      // Business
      business: {
        mrr,
        plan: {
          name: company.plan?.name || "No Plan",
          price: planPrice,
        },
        status: company.status,
        daysUntilRenewal,
        isActive: company.isActive,
      },

      // Usage
      usage: {
        users: {
          current: totalUsers,
          limit: planLimits?.max_users || 0,
          percentage: Math.round(usagePercentages.users),
        },
        whatsapp: {
          current: activeWhatsAppSessions,
          limit: planLimits?.max_whatsapp_sessions || 0,
          percentage: Math.round(usagePercentages.whatsapp),
        },
        queues: {
          current: totalQueues,
          limit: planLimits?.max_queues || 0,
          percentage: Math.round(usagePercentages.queues),
        },
        aiAssistants: {
          current: aiAssistants,
          limit: planLimits?.max_ai_assistants || 0,
        },
        tickets: {
          thisMonth: ticketsThisMonth,
          lastMonth: ticketsLastMonth,
          growth: Math.round(ticketGrowth),
        },
      },

      // Engagement
      engagement: {
        lastAdminLogin: lastAdminLogin?.updatedAt || null,
        conversationsThisMonth,
        messagesThisMonth,
        avgMessagesPerConversation:
          conversationsThisMonth > 0
            ? Math.round(messagesThisMonth / conversationsThisMonth)
            : 0,
      },

      // AI Performance
      ai: {
        resolutionRate: Math.round(aiResolutionRate),
        ticketsResolved: aiResolvedCount,
        avgResolutionTimeSeconds: Math.round(avgResolutionTimeSeconds),
      },

      // Health
      health: {
        openTickets,
        overdueTickets,
        healthScore: this.calculateHealthScore(
          openTickets,
          overdueTickets,
          totalUsers,
          activeWhatsAppSessions
        ),
      },
    };
  },

  calculateHealthScore(
    openTickets: number,
    overdueTickets: number,
    users: number,
    whatsappSessions: number
  ): number {
    let score = 100;

    // Penalize for overdue tickets
    if (overdueTickets > 10) score -= 30;
    else if (overdueTickets > 5) score -= 15;
    else if (overdueTickets > 0) score -= 5;

    // Penalize for too many open tickets
    if (openTickets > 50) score -= 20;
    else if (openTickets > 20) score -= 10;

    // Penalize for inactive (no users or whatsapp)
    if (users === 0) score -= 25;
    if (whatsappSessions === 0) score -= 15;

    return Math.max(0, score);
  },

  async generateImpersonationToken(targetCompanyId: string) {
    const adminUser = await prisma.user.findFirst({
      where: {
        companyId: targetCompanyId,
        role: "ADMIN",
      },
    });

    if (!adminUser) {
      // Fallback: try to find any user if no ADMIN exists
      const anyUser = await prisma.user.findFirst({
        where: { companyId: targetCompanyId },
      });

      if (!anyUser) {
        throw new Error("No se encontraron usuarios para esta empresa.");
      }

      const token = signToken({
        id: anyUser.id,
        role: anyUser.role,
        companyId: anyUser.companyId,
      });
      return { token, user: anyUser };
    }

    const token = signToken({
      id: adminUser.id,
      role: adminUser.role,
      companyId: adminUser.companyId,
    });

    return { token, user: adminUser };
  },

  async getDashboardStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. Fetch Companies and Plans
    const companies = await prisma.company.findMany({
      include: { plan: true },
    });

    // 2. Calculate MRR
    const mrr = companies
      .filter((c) => c.isActive && c.plan)
      .reduce((sum, c) => sum + (c.plan?.price || 0), 0);

    // 3. Calculate Churn Rate
    const totalCompanies = companies.length;
    const inactiveCompanies = companies.filter((c) => !c.isActive).length;
    const churnRate =
      totalCompanies > 0 ? (inactiveCompanies / totalCompanies) * 100 : 0;

    // 4. New Companies (Month)
    const newCompaniesMonth = companies.filter(
      (c) => c.createdAt >= startOfMonth
    ).length;

    // 5. Revenue Trend (Last 12 Months)
    const revenueTrend = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mrrAtDate = companies
        .filter(
          (c) =>
            c.createdAt <
              new Date(date.getFullYear(), date.getMonth() + 1, 0) &&
            c.isActive &&
            c.plan
        )
        .reduce((sum, c) => sum + (c.plan?.price || 0), 0);
      revenueTrend.push(mrrAtDate);
    }

    // 6. Recent Activity (Last 5 created companies)
    const recentActivity = companies
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5)
      .map((c) => ({
        icon: "✨",
        text: `Se creó una nueva empresa: ${c.name}`,
        time: c.createdAt,
        color: "text-blue-500",
      }));

    // 7. Global Usage Stats
    const totalUsers = await prisma.user.count();
    const totalTickets = await prisma.ticket.count();
    const totalMessages = await prisma.message.count();

    // 8. Top Tenants by Activity (Ticket Volume)
    const topTenants = await prisma.company.findMany({
      take: 5,
      include: {
        _count: {
          select: { tickets: true, users: true },
        },
        plan: true,
      },
      orderBy: {
        tickets: {
          _count: "desc",
        },
      },
    });

    const formattedTopTenants = topTenants.map((c) => ({
      id: c.id,
      name: c.name,
      plan: c.plan?.name || "N/A",
      users: c._count.users,
      tickets: c._count.tickets,
      status: c.status,
    }));

    // Calculate ARPU (Average Revenue Per User)
    const arpu = totalUsers > 0 ? mrr / totalUsers : 0;

    return {
      mrr,
      arr: mrr * 12,
      activeCompanies: totalCompanies - inactiveCompanies,
      churnRate,
      newCompaniesMonth,
      revenueTrend,
      recentActivity,
      totalUsers,
      totalTickets,
      totalMessages,
      topTenants: formattedTopTenants,
      arpu,
    };
  },
};
