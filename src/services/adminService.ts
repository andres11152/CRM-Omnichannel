import type { Company, Plan, CompanyStatus, Prisma } from "@prisma/client";
import { Buffer } from "buffer";
import { prisma } from "@/config/prisma";
import { signToken } from "@/controllers/authController";

export const adminService = {
  // --- TENANT MANAGEMENT ---

  async getAllCompanies() {
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

  async updateCompanyStatus(companyId: string, status: CompanyStatus) {
    // La lógica ahora usa los valores del enum de Prisma
    const isActive = status === "ACTIVE" || status === "TRIAL";

    return prisma.company.update({
      where: { id: companyId },
      data: { status, isActive },
    });
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
    return prisma.company.update({
      where: { id: companyId },
      data: {
        name: data.name,
        slug: data.slug,
        planId: data.planId,
        status: data.status,
        subscriptionEndsAt: data.subscriptionEndsAt,
        isActive: data.status
          ? data.status === "ACTIVE" || data.status === "TRIAL"
          : undefined,
      },
      include: { plan: true },
    });
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
        config: plan.config as Prisma.InputJsonValue, // Usamos una aserción de tipo para el campo JSON
      },
      create: {
        // Construimos el objeto de creación solo con los campos necesarios
        id: plan.id,
        name: plan.name,
        price: plan.price,
        config: plan.config as Prisma.InputJsonValue,
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

    // 1. Active Users
    const activeUsers = await prisma.user.count({
      where: { companyId },
    });

    // 2. Tickets (Month)
    const ticketsThisMonth = await prisma.ticket.count({
      where: {
        companyId,
        createdAt: {
          gte: startOfMonth,
        },
      },
    });

    // 3. AI Resolution %
    const resolvedTickets = await prisma.ticket.findMany({
      where: {
        companyId,
        status: "RESOLVED",
        resolvedAt: { not: null },
      },
      include: {
        queue: true,
      },
    });

    const totalResolved = resolvedTickets.length;
    let aiResolvedCount = 0;
    let totalResolutionTime = 0;

    for (const ticket of resolvedTickets) {
      // Check if resolved by AI (heuristic: queue type is AI)
      if (ticket.queue?.type === "AI") {
        aiResolvedCount++;
      }

      // Calculate resolution time
      if (ticket.resolvedAt) {
        const diff = ticket.resolvedAt.getTime() - ticket.createdAt.getTime();
        totalResolutionTime += diff;
      }
    }

    const aiResolutionRate =
      totalResolved > 0 ? (aiResolvedCount / totalResolved) * 100 : 0;
    const avgResolutionTime =
      totalResolved > 0 ? totalResolutionTime / totalResolved : 0;

    return {
      activeUsers,
      ticketsThisMonth,
      aiResolutionRate: Math.round(aiResolutionRate),
      avgResolutionTime: Math.round(avgResolutionTime / 1000), // in seconds
    };
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
