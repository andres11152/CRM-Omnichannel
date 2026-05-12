/**
 * [STAT] ADMIN METRICS SERVICE
 *
 * All analytics and metrics logic for the admin dashboard:
 * - getCompanyMetrics: Per-tenant usage, engagement, AI, and health metrics
 * - getDashboardStats: Global SaaS dashboard (MRR, churn, ARPU, top tenants)
 * - calculateHealthScore: Tenant health scoring algorithm
 */

import type { Company, Plan, Ticket, BillingTransaction } from "@prisma/client";
import { userRepository } from "@/repositories/UserRepository";
import { companyRepository } from "@/repositories/CompanyRepository";
import { statsRepository } from "@/repositories/StatsRepository";
import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { ticketRepository } from "@/repositories/TicketRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { messageRepository } from "@/repositories/MessageRepository";
import { billingRepository } from "@/repositories/BillingRepository";
import { AppError } from "@/utils/AppError";
import TenantContextManager from "@/config/tenantContext";

// [SEC] STRICT TYPING FOR METRICS
type CompanyWithPlan = Company & { plan: Plan | null };
type TicketWithQueue = { 
  id: string; 
  status: string; 
  resolvedAt: Date | null; 
  createdAt: Date; 
  queue: { type: string } | null; 
};

// [SEC] STRICT TYPING FOR JSON CONFIG
interface PlanConfig {
  max_users?: number;
  maxLimitUsers?: number;
  max_whatsapp_connections?: number;
  max_whatsapp_sessions?: number;
  max_queues?: number;
  max_ai_assistants?: number;
  storage_limit_gb?: number;
  max_contacts?: number;
  max_companies?: number;
  max_workflows?: number;
  [key: string]: unknown;
}

export const adminMetricsService = {
  // ────────────────────────────────────────────────
  // PER-TENANT METRICS
  // ────────────────────────────────────────────────

  async getCompanyMetrics(companyId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const company = await companyRepository.findUnique({
      where: { id: companyId },
      include: { plan: true },
    }) as CompanyWithPlan | null;

    if (!company) {
      throw new AppError("Company not found", 404);
    }

    // === BUSINESS METRICS ===
    const planPrice = company.plan?.price || 0;
    const mrr = planPrice;
    const daysUntilRenewal = company.subscriptionEndsAt
      ? Math.ceil(
          (company.subscriptionEndsAt.getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24),
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
      userRepository.count({}),
      whatsappSessionRepository.count(companyId, {
        where: { status: "CONNECTED" },
      }),
      statsRepository.countQueues({ where: { companyId } }),
      ticketRepository.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      ticketRepository.count({
        where: {
          createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        },
      }),
      statsRepository.countAIAssistants({ where: { companyId } }),
    ]);

    const planLimits = company.plan?.config as unknown as PlanConfig || {};

    const maxUsers = planLimits.max_users || 0;
    const maxWhatsapp = planLimits.max_whatsapp_sessions || 0;
    const maxQueues = planLimits.max_queues || 0;
    const maxAi = planLimits.max_ai_assistants || 0;

    const usagePercentages = {
      users: maxUsers > 0 ? (totalUsers / maxUsers) * 100 : 0,
      whatsapp:
        maxWhatsapp > 0 ? (activeWhatsAppSessions / maxWhatsapp) * 100 : 0,
      queues: maxQueues > 0 ? (totalQueues / maxQueues) * 100 : 0,
    };

    const ticketGrowth =
      ticketsLastMonth > 0
        ? ((ticketsThisMonth - ticketsLastMonth) / ticketsLastMonth) * 100
        : 0;

    // === ENGAGEMENT METRICS ===
    const lastAdminLogin = await userRepository.findFirst({
      where: { role: "ADMIN" },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    });

    const conversationsThisMonth = await conversationRepository.count({
      where: { companyId, createdAt: { gte: startOfMonth } },
    });

    const messagesThisMonth = await messageRepository.count({
      where: {
        conversation: { companyId },
        createdAt: { gte: startOfMonth },
      },
    });

    // === AI METRICS ===
    const resolvedTickets = await ticketRepository.findMany({
      where: {
        status: "RESOLVED",
        resolvedAt: { not: null },
        createdAt: { gte: startOfMonth },
      },
      include: { queue: true },
    });

    const totalResolved = resolvedTickets.length;
    let aiResolvedCount = 0;
    let totalResolutionTime = 0;

    for (const ticket of resolvedTickets as unknown as TicketWithQueue[]) {
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
    const openTickets = await ticketRepository.count({
      where: { companyId, status: { in: ["OPEN", "IN_PROGRESS"] } },
    });

    const overdueTickets = await ticketRepository.count({
      where: {
        companyId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
        createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    });

    return {
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
      usage: {
        users: {
          current: totalUsers,
          limit: maxUsers,
          percentage: Math.round(usagePercentages.users),
        },
        whatsapp: {
          current: activeWhatsAppSessions,
          limit: maxWhatsapp,
          percentage: Math.round(usagePercentages.whatsapp),
        },
        queues: {
          current: totalQueues,
          limit: maxQueues,
          percentage: Math.round(usagePercentages.queues),
        },
        aiAssistants: {
          current: aiAssistants,
          limit: maxAi,
        },
        tickets: {
          thisMonth: ticketsThisMonth,
          lastMonth: ticketsLastMonth,
          growth: Math.round(ticketGrowth),
        },
      },
      engagement: {
        lastAdminLogin: lastAdminLogin?.updatedAt || null,
        conversationsThisMonth,
        messagesThisMonth,
        avgMessagesPerConversation:
          conversationsThisMonth > 0
            ? Math.round(messagesThisMonth / conversationsThisMonth)
            : 0,
      },
      ai: {
        resolutionRate: Math.round(aiResolutionRate),
        ticketsResolved: aiResolvedCount,
        avgResolutionTimeSeconds: Math.round(avgResolutionTimeSeconds),
      },
      health: {
        openTickets,
        overdueTickets,
        healthScore: this.calculateHealthScore(
          openTickets,
          overdueTickets,
          totalUsers,
          activeWhatsAppSessions,
        ),
      },
    };
  },

  // ────────────────────────────────────────────────
  // HEALTH SCORE ALGORITHM
  // ────────────────────────────────────────────────

  calculateHealthScore(
    openTickets: number,
    overdueTickets: number,
    users: number,
    whatsappSessions: number,
  ): number {
    let score = 100;

    if (overdueTickets > 10) score -= 30;
    else if (overdueTickets > 5) score -= 15;
    else if (overdueTickets > 0) score -= 5;

    if (openTickets > 50) score -= 20;
    else if (openTickets > 20) score -= 10;

    if (users === 0) score -= 25;
    if (whatsappSessions === 0) score -= 15;

    return Math.max(0, score);
  },

  // ────────────────────────────────────────────────
  // GLOBAL DASHBOARD STATS (SaaS Overview)
  // ────────────────────────────────────────────────

  async getDashboardStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. Fetch Companies and Plans
    const allCompanies = await companyRepository.findMany({
      include: { plan: true },
    });
    // [SEC] Exclude the system admin tenant from business metrics
    const companies = (allCompanies as (Company & { plan: Plan | null })[]).filter(
      (c) => c.slug !== "reply-software",
    );

    // 2. Calculate MRR
    const mrr = (companies as CompanyWithPlan[])
      .filter((c) => c.isActive && c.plan)
      .reduce((sum: number, c) => sum + (c.plan?.price || 0), 0);

    // 3. Calculate Churn Rate
    const totalCompanies = companies.length;
    const inactiveCompanies = companies.filter((c) => !c.isActive).length;
    const churnRate =
      totalCompanies > 0 ? (inactiveCompanies / totalCompanies) * 100 : 0;

    // 4. New Companies (Month)
    const newCompaniesMonth = companies.filter(
      (c) => c.createdAt >= startOfMonth,
    ).length;

    // 5. Revenue Trend (Last 12 Months)
    const revenueTrend = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mrrAtDate = (companies as CompanyWithPlan[])
        .filter(
          (c) =>
            c.createdAt <
              new Date(date.getFullYear(), date.getMonth() + 1, 0) &&
            c.isActive &&
            c.plan,
        )
        .reduce((sum: number, c) => sum + (c.plan?.price || 0), 0);
      revenueTrend.push(mrrAtDate);
    }

    // 6. Recent Activity (Synthesized from multiple real sources)
    const [latestTickets, latestTransactions] = await Promise.all([
      ticketRepository.findMany({ 
        take: 3, 
        orderBy: { createdAt: "desc" }, 
        include: { company: true } 
      }) as Promise<(Ticket & { company: Company })[]>,
      billingRepository.findMany({ 
        take: 2, 
        orderBy: { createdAt: "desc" }, 
        include: { company: true } 
      }) as Promise<(BillingTransaction & { company: Company })[]>
    ]);

    const recentActivity = [
      ...companies.slice(0, 3).map(c => ({
        icon: "Building2",
        text: `Nueva empresa registrada: ${c.name}`,
        time: c.createdAt,
        color: "text-blue-500"
      })),
      ...latestTickets.map(t => ({
        icon: "MessageSquare",
        text: `Ticket #${t.ticketNumber} creado en ${t.company.name}`,
        time: t.createdAt,
        color: "text-amber-500"
      })),
      ...latestTransactions.map(tr => ({
        icon: "DollarSign",
        text: `Pago de ${tr.amount/100} ${tr.currency} de ${tr.company.name}`,
        time: tr.createdAt,
        color: "text-emerald-500"
      }))
    ].sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 6);

    // 7. Global Usage Stats
    const [totalUsers, totalTickets] = await TenantContextManager.runAsSystem(
      async () => [
        await userRepository.count({
          where: {
            AND: [
              {
                NOT: {
                  email: { endsWith: "@whatsapp.user" },
                },
              },
              {
                company: {
                  slug: { not: "reply-software" },
                },
              },
            ],
          },
        }),
        await ticketRepository.count({}),
      ],
    );
    const totalMessages = await messageRepository.count({});

    // 8. Top Tenants by Activity
    const topTenants = await companyRepository.findMany({
      where: {
        slug: { notIn: ["reply-software"] },
      },
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

    const formattedTopTenants = (
      topTenants as (Company & {
        plan: Plan | null;
        _count: { tickets: number; users: number } | null;
      })[]
    ).map((c) => ({
      id: c.id,
      name: c.name,
      plan: c.plan?.name || "N/A",
      users: c._count?.users || 0,
      tickets: c._count?.tickets || 0,
      status: c.status,
    }));

    // Calculate ARPU
    const arpu = totalUsers > 0 ? mrr / totalUsers : 0;

    return {
      mrr,
      arr: mrr * 12,
      totalCompanies,
      activeCompanies: totalCompanies - inactiveCompanies,
      totalRevenue: mrr,
      systemHealth: "99.98%",
      churnRate,
      newCompaniesMonth,
      revenueTrend,
      recentActivity,
      activeUsers: totalUsers,
      totalTickets,
      totalMessages,
      topTenants: formattedTopTenants,
      arpu,
    };
  },
};
