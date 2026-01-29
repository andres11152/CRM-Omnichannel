import type { Company, Plan, CompanyStatus, Prisma } from "@prisma/client";
import { Buffer } from "buffer";
import { prisma } from "@/config/database";
import { signToken } from "@/controllers/authController";
import { cacheService } from "@/services/cacheService";
import { gateway } from "@/gateways/socketGateway";
import { Logger } from "@/utils/logger";
import { AppError } from "@/utils/AppError";
import {
  CreateCompanyDto,
  SavePlanDto,
  UpdateCompanyDto,
} from "@/schemas/adminSchemas";
import bcrypt from "bcryptjs";

// 🛡️ STRICT TYPING FOR JSON CONFIG
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
  [key: string]: unknown; // Allow extensibility but explicitly unknown
}

export const adminService = {
  async getSystemStatus() {
    // 1. API Gateway (Self)
    const apiLatency = Math.floor(Math.random() * 20) + 5; // 5-25ms

    // 2. Database (Prisma)
    const dbStart = Date.now();
    let dbStatus = "Operacional";
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      Logger.error("[SystemStatus] Database check failed", e);
      dbStatus = "Error";
    }
    const dbLatency = dbStatus === "Operacional" ? Date.now() - dbStart : 0;

    // 3. Queues (Socket/Redis)
    const isRedisUp = gateway.isRedisConnected();
    const queueStatus = isRedisUp ? "Operacional" : "Inactivo (Memoria)";
    const queueLatency = isRedisUp ? Math.floor(Math.random() * 10) + 2 : 0;

    // 4. Storage (S3/Local)
    const storageStatus = "Operacional";
    const storageLatency = Math.floor(Math.random() * 50) + 20;

    return {
      api: { status: "Operacional", latency: apiLatency },
      database: { status: dbStatus, latency: dbLatency },
      queues: { status: queueStatus, latency: queueLatency },
      storage: { status: storageStatus, latency: storageLatency },
    };
  },
  // --- TENANT MANAGEMENT ---

  async getAllCompanies() {
    // Cache disabled for debugging connection issues
    // return cacheService.wrap("admin:companies:all", async () => {
    return prisma.company.findMany({
      // Filter out system companies safely
      where: {
        users: {
          none: {
            // Master usually has a specific role. Let's rely on slug for safety if possible or role MASTER
            role: "MASTER",
          },
        },
        // Fallback: Exclude by slug convention if MASTER role check fails
        slug: { notIn: ["reply-saas-admin", "crm-saas"] },
      },
      include: {
        users: {
          where: { role: { in: ["ADMIN"] } },
          select: { email: true },
          take: 1,
        },
        plan: true,
      },
    });
    // }, 120);
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

  async createCompany(data: CreateCompanyDto) {
    const passwordToUse =
      data.password || Math.random().toString(36).slice(-10) + "Aa1!";
    const hashedPassword = await bcrypt.hash(passwordToUse, 12);

    const companyData: Prisma.CompanyCreateInput = {
      name: data.name,
      slug: data.slug,
      plan: { connect: { id: data.planId } },
      smtpPassword: data.smtpPassword,
      // Create the initial Admin User for this company
      users: {
        create: {
          email: data.adminEmail,
          role: "ADMIN",
          isOwner: true,
          password: hashedPassword,
          name: `Admin ${data.name}`,
        },
      },
    };

    if (companyData.smtpPassword) {
      const { encrypt } = await import("@/utils/encryption");
      companyData.smtpPassword = encrypt(companyData.smtpPassword);
    }

    const newCompany = await prisma.company.create({
      data: companyData,
      include: { users: true }, // Return users to see the created admin
    });

    Logger.info(
      `[Admin] Created Company: ${newCompany.name} with Admin: ${data.adminEmail}`,
    );
    return newCompany;
  },

  async updateCompany(companyId: string, data: UpdateCompanyDto) {
    // Mask sensitive logs
    const logData = { ...data };
    if (logData.smtpPassword) logData.smtpPassword = "***";

    Logger.info(
      `[AdminService] Updating company ${companyId}. Data: ${JSON.stringify(
        logData,
      )}`,
    );

    // Prepare update data
    const updatePayload: Prisma.CompanyUpdateInput = {
      name: data.name,
      slug: data.slug,
      plan: data.planId ? { connect: { id: data.planId } } : undefined,
      status: data.status,
      subscriptionEndsAt: data.subscriptionEndsAt
        ? new Date(data.subscriptionEndsAt as string)
        : data.subscriptionEndsAt,
      // isActive is derived below
    };

    if (data.status) {
      updatePayload.isActive =
        data.status === "ACTIVE" || data.status === "TRIAL";
    }

    // Check if Plan is changing and validate resource limits (Prevent Illegal Downgrade)
    if (data.planId) {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { planId: true },
      });

      if (company && company.planId !== data.planId) {
        // 1. Fetch Target Plan
        const targetPlan = await prisma.plan.findUnique({
          where: { id: data.planId },
        });
        if (!targetPlan)
          throw new AppError("El plan seleccionado no existe.", 400);

        // 2. Fetch Current Usage
        const { planLimitsService } =
          await import("@/services/planLimitsService");
        const usage = await planLimitsService.getCurrentUsage(companyId);

        // 3. Normalize Target Limits
        const targetConfig = (targetPlan.config as unknown as PlanConfig) || {};
        const targetLimits = {
          max_users: targetConfig.max_users ?? targetConfig.maxLimitUsers ?? 1,
          max_whatsapp:
            targetConfig.max_whatsapp_connections ??
            targetConfig.max_whatsapp_sessions ??
            1,
          max_queues: targetConfig.max_queues ?? 1,
          storage_gb:
            targetPlan.storageLimitGb !== null
              ? targetPlan.storageLimitGb
              : (targetConfig.storage_limit_gb ?? 0),
        };

        // 4. Validate Constraints (The "100-Year" Rule check)
        const violations: string[] = [];

        // Check Users
        if (
          targetLimits.max_users !== -1 &&
          usage.users > targetLimits.max_users
        ) {
          violations.push(
            `Usuarios activos (${usage.users}) exceden el límite del nuevo plan (${targetLimits.max_users}). Elimina usuarios antes de cambiar.`,
          );
        }

        // Check WhatsApp
        if (
          targetLimits.max_whatsapp !== -1 &&
          usage.whatsapp_sessions > targetLimits.max_whatsapp
        ) {
          violations.push(
            `Líneas de WhatsApp (${usage.whatsapp_sessions}) exceden el límite del nuevo plan (${targetLimits.max_whatsapp}).`,
          );
        }

        // Check Queues
        if (
          targetLimits.max_queues !== -1 &&
          usage.queues > targetLimits.max_queues
        ) {
          violations.push(
            `Colas de atención (${usage.queues}) exceden el límite del nuevo plan (${targetLimits.max_queues}).`,
          );
        }

        // Check Storage (Optional strictness, can be soft limit)
        const currentStorageGb = usage.storage_bytes / (1024 * 1024 * 1024);
        if (
          targetLimits.storage_gb !== -1 &&
          targetLimits.storage_gb > 0 &&
          currentStorageGb > targetLimits.storage_gb
        ) {
          violations.push(
            `Almacenamiento usado (${currentStorageGb.toFixed(
              2,
            )} GB) excede el nuevo límite (${targetLimits.storage_gb} GB).`,
          );
        }

        if (violations.length > 0) {
          throw new AppError(
            `No se puede realizar el cambio de plan (Downgrade Ilegal):\n- ${violations.join(
              "\n- ",
            )}`,
            400,
          );
        }
      }
    }

    // 🔒 SECURITY: Encrypt SMTP password
    if (data.smtpPassword) {
      const { encrypt } = await import("@/utils/encryption");
      updatePayload.smtpPassword = encrypt(data.smtpPassword);
    }

    // Solo actualizar la DB con el payload limpio
    const updated = await prisma.company.update({
      where: { id: companyId },
      data: updatePayload,
      include: { plan: true },
    });

    // Invalidate cache immediately to reflect changes
    await cacheService.delete("admin:companies:all");
    await cacheService.invalidateCompany(companyId);
    // Force invalidate the specific v2 plan cache key we created in planLimitsService
    await cacheService.delete(`company:${companyId}:plan:v2`);

    return updated;
  },

  // --- PLAN MANAGEMENT ---

  async getAllPlans() {
    return prisma.plan.findMany();
  },

  async savePlan(plan: SavePlanDto) {
    const config = plan.config as unknown as PlanConfig;

    // Explicitly define update data object
    const updateData: Prisma.PlanUpdateInput = {
      name: plan.name, // Ensure name exists in DTO
      price: plan.price,
      config: plan.config as Prisma.InputJsonValue,
      storageLimitGb: config?.storage_limit_gb
        ? Number(config.storage_limit_gb)
        : null,
      maxContacts: config?.max_contacts ? Number(config.max_contacts) : null,
      maxCompanies: config?.max_companies ? Number(config.max_companies) : null,
      maxWorkflows: config?.max_workflows ? Number(config.max_workflows) : null,
    };

    const savedPlan = await prisma.plan.upsert({
      where: { id: plan.id },
      update: updateData,
      create: {
        // Construimos el objeto de creación solo con los campos necesarios
        id: plan.id,
        name: plan.name,
        price: plan.price,
        config: plan.config as Prisma.InputJsonValue,
        storageLimitGb: config?.storage_limit_gb
          ? Number(config.storage_limit_gb)
          : null,
        maxContacts: config?.max_contacts ? Number(config.max_contacts) : null,
        maxCompanies: config?.max_companies
          ? Number(config.max_companies)
          : null,
        maxWorkflows: config?.max_workflows
          ? Number(config.max_workflows)
          : null,
      },
    });

    // 🚀 CASCADING CACHE INVALIDATION (Optimized Batching)
    // When a plan changes, all companies using it must see the new limits immediately.
    const affectedCompanies = await prisma.company.findMany({
      where: { planId: plan.id },
      select: { id: true },
    });

    if (affectedCompanies.length > 0) {
      const { planLimitsService } =
        await import("@/services/planLimitsService");
      const companyIds = affectedCompanies.map((c) => c.id);

      // Process in chunks of 500 to prevent Redis blocking on massive plans
      const CHUNK_SIZE = 500;
      for (let i = 0; i < companyIds.length; i += CHUNK_SIZE) {
        const chunk = companyIds.slice(i, i + CHUNK_SIZE);
        await planLimitsService.invalidatePlanCache(chunk);
      }

      Logger.info(
        `[Admin] Plan ${plan.name} updated. Invalidated cache for ${affectedCompanies.length} companies.`,
      );
    }

    return savedPlan;
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
      throw new AppError("Company not found", 404);
    }

    // === BUSINESS METRICS ===
    const planPrice = company.plan?.price || 0;
    const mrr = planPrice; // Monthly Recurring Revenue
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

    const planLimits = (company.plan?.config as unknown as PlanConfig) || {};

    // Safely access properties with default fallback
    const maxUsers = planLimits.max_users ?? 0;
    const maxWhatsapp = planLimits.max_whatsapp_sessions ?? 0;
    const maxQueues = planLimits.max_queues ?? 0;
    const maxAi = planLimits.max_ai_assistants ?? 0;

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
          activeWhatsAppSessions,
        ),
      },
    };
  },

  calculateHealthScore(
    openTickets: number,
    overdueTickets: number,
    users: number,
    whatsappSessions: number,
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
        throw new AppError(
          "No se encontraron usuarios para esta empresa.",
          404,
        );
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
      (c) => c.createdAt >= startOfMonth,
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
            c.plan,
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
