/**
 * [SEC] ADMIN SERVICE (Refactored Orchestrator)
 *
 * Tenant management, plan CRUD, impersonation, and system status.
 * Metrics/analytics delegated to AdminMetricsService.
 */

import type { CompanyStatus, Prisma } from "@prisma/client";
import { userRepository } from "@/repositories/UserRepository";
import { companyRepository } from "@/repositories/CompanyRepository";
import { planRepository } from "@/repositories/PlanRepository";
import { signToken } from "@/controllers/authController";
import { cacheService } from "@/services/CacheService";
import { Logger } from "@/utils/logger";
import { AppError } from "@/utils/AppError";
import {
  CreateCompanyDto,
  SavePlanDto,
  UpdateCompanyDto,
} from "@/schemas/adminSchemas";
import bcrypt from "bcryptjs";
import { adminMetricsService } from "./admin/AdminMetricsService";

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

export const adminService = {
  async getSystemStatus() {
    // 1. API Gateway (Self)
    const startApi = Date.now();
    // Simple logic check or just time calculation
    const apiLatency = Date.now() - startApi;

    // 2. Database (Prisma)
    let dbStatus = "healthy";
    const startDb = Date.now();
    let dbLatency = 0;

    try {
      await userRepository.count({});
      dbLatency = Date.now() - startDb;
    } catch (e) {
      dbStatus = "error";
      Logger.error("[SystemStatus] Database check failed", e);
    }

    // 3. Redis
    let redisStatus = "healthy";
    let redisLatency = 0;
    const startRedis = Date.now();

    try {
      await cacheService.set("health_check", "ok", 10);
      const val = await cacheService.get("health_check");
      redisLatency = Date.now() - startRedis;
      if (val !== "ok") redisStatus = "degraded";
    } catch (e) {
      redisStatus = "error";
      Logger.error("[SystemStatus] Redis check failed", e);
    }

    return {
      api: {
        status: "healthy",
        latency: apiLatency,
      },
      database: {
        status: dbStatus,
        latency: dbLatency,
      },
      queues: {
        status: redisStatus,
        latency: redisLatency,
      },
      storage: {
        status: "healthy",
        latency: 0,
      },
      availability: 99.98, // Real calculation could be added later
      lastCheck: new Date().toISOString(),
    };
  },

  // --- TENANT MANAGEMENT ---

  async getAllCompanies() {
    return cacheService.wrap(
      "admin:companies:all",
      () =>
        companyRepository.findMany({
          where: {
            slug: { not: "reply-software" },
          },
          include: {
            plan: true,
            _count: { select: { users: true, tickets: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
      300,
    );
  },

  async getCompanyUsers(companyId: string) {
    const users = await userRepository.findMany({
      where: {
        role: { not: "MASTER" },
        NOT: { email: { endsWith: "@whatsapp.user" } },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        profilePicUrl: true,
      },
      orderBy: { name: "asc" },
    }, companyId);

    return users as unknown as {
      id: string;
      email: string;
      name: string | null;
      role: string;
      profilePicUrl: string | null;
    }[];
  },


  async updateCompanyStatus(companyId: string, status: CompanyStatus) {
    const updated = await companyRepository.update(companyId, {
      status,
      isActive: status === "ACTIVE" || status === "TRIAL",
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

    const newCompany = await companyRepository.create({
      data: companyData,
      include: { users: true },
    });

    // 🚀 [MARKETPLACE] Distribute Master Templates & Flows to the new tenant
    try {
      const { marketplaceService } = await import("./admin/MarketplaceService");
      await marketplaceService.distributeToCompany(newCompany.id);
    } catch (err) {
      Logger.error(`[Admin] Template distribution failed for ${newCompany.id}`, err);
      // We don't block company creation if distribution fails, but we log it.
    }

    Logger.info(
      `[Admin] Created Company: ${newCompany.name} with Admin: ${data.adminEmail}`,
    );
    return newCompany;
  },

  async updateCompany(companyId: string, data: UpdateCompanyDto) {
    const logData = { ...data };
    if (logData.smtpPassword) logData.smtpPassword = "***";

    Logger.info(
      `[AdminService] Updating company ${companyId}. Data: ${JSON.stringify(
        logData,
      )}`,
    );

    const updatePayload: Prisma.CompanyUpdateInput = {
      name: data.name,
      slug: data.slug,
      plan: data.planId ? { connect: { id: data.planId } } : undefined,
      status: data.status,
      subscriptionEndsAt: data.subscriptionEndsAt
        ? new Date(data.subscriptionEndsAt as string)
        : data.subscriptionEndsAt,
    };

    if (data.status) {
      updatePayload.isActive =
        data.status === "ACTIVE" || data.status === "TRIAL";
    }

    // Check if Plan is changing and validate resource limits
    if (data.planId) {
      const company = await companyRepository.findUnique({
        where: { id: companyId },
        select: { planId: true },
      });

      if (company && company.planId !== data.planId) {
        const targetPlan = await planRepository.findUnique({
          where: { id: data.planId },
        });
        if (!targetPlan)
          throw new AppError("El plan seleccionado no existe.", 400);

        const { planLimitsService } =
          await import("@/services/PlanLimitsService");
        const usage = await planLimitsService.getCurrentUsage(companyId);

        const targetConfig = (targetPlan.config as unknown as PlanConfig) || {};
        const targetLimits = {
          max_users: targetConfig.max_users || targetConfig.maxLimitUsers || 1,
          max_whatsapp:
            targetConfig.max_whatsapp_connections ??
            targetConfig.max_whatsapp_sessions ??
            1,
          max_queues: targetConfig.max_queues || 1,
          storage_gb:
            targetPlan.storageLimitGb !== null
              ? targetPlan.storageLimitGb
              : (targetConfig.storage_limit_gb || 0),
        };

        const violations: string[] = [];

        if (
          targetLimits.max_users !== -1 &&
          usage.users > targetLimits.max_users
        ) {
          violations.push(
            `Usuarios activos (${usage.users}) exceden el límite del nuevo plan (${targetLimits.max_users}). Elimina usuarios antes de cambiar.`,
          );
        }

        if (
          targetLimits.max_whatsapp !== -1 &&
          usage.whatsapp_sessions > targetLimits.max_whatsapp
        ) {
          violations.push(
            `Líneas de WhatsApp (${usage.whatsapp_sessions}) exceden el límite del nuevo plan (${targetLimits.max_whatsapp}).`,
          );
        }

        if (
          targetLimits.max_queues !== -1 &&
          usage.queues > targetLimits.max_queues
        ) {
          violations.push(
            `Colas de atención (${usage.queues}) exceden el límite del nuevo plan (${targetLimits.max_queues}).`,
          );
        }

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

    //  SECURITY: Encrypt SMTP password
    if (data.smtpPassword) {
      const { encrypt } = await import("@/utils/encryption");
      updatePayload.smtpPassword = encrypt(data.smtpPassword);
    }

    const updated = await companyRepository.updateRaw({
      where: { id: companyId },
      data: updatePayload,
      include: { plan: true },
    });

    await cacheService.delete("admin:companies:all");
    await cacheService.invalidateCompany(companyId);
    await cacheService.delete(`company:${companyId}:plan:v2`);

    return updated;
  },

  // --- PLAN MANAGEMENT ---

  async getAllPlans() {
    return planRepository.findMany();
  },

  async savePlan(plan: SavePlanDto) {
    const config = plan.config as unknown as PlanConfig;

    const updateData: Prisma.PlanUpdateInput = {
      name: plan.name,
      price: plan.price,
      config: plan.config as Prisma.InputJsonValue,
      storageLimitGb: config?.storage_limit_gb
        ? Number(config.storage_limit_gb)
        : null,
      maxContacts: config?.max_contacts ? Number(config.max_contacts) : null,
      maxCompanies: config?.max_companies ? Number(config.max_companies) : null,
      maxWorkflows: config?.max_workflows ? Number(config.max_workflows) : null,
    };

    const savedPlan = await planRepository.upsert({
      where: { id: plan.id },
      update: updateData,
      create: {
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

    //  CASCADING CACHE INVALIDATION
    const affectedCompanies = await companyRepository.findMany({
      where: { planId: plan.id },
      select: { id: true },
    });

    if (affectedCompanies.length > 0) {
      const { planLimitsService } =
        await import("@/services/PlanLimitsService");
      const companyIds = affectedCompanies.map((c) => c.id);

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
    return planRepository.delete({ where: { id: planId } });
  },

  // --- SECURITY: IMPERSONATION ---

  async generateImpersonationToken(
    targetCompanyId: string,
    metadata: { ip: string; userAgent: string },
    userId?: string, // Optional: impersonate a specific user
  ) {
    Logger.info(
      `[AdminService] Attempting impersonation for company: ${targetCompanyId} ${userId ? `(User: ${userId})` : ""}`,
    );

    // [SEC] Use prisma directly to bypass UserRepository's automated tenant filtering (RLS)
    const { prisma: db } = await import("@/config/database");

    let targetUser;

    if (userId) {
      // Impersonate specific user
      targetUser = await db.user.findUnique({
        where: { id: userId, companyId: targetCompanyId },
      });
    } else {
      // Default: Find first ADMIN or AGENT
      targetUser = await db.user.findFirst({
        where: {
          companyId: targetCompanyId,
          role: { not: "MASTER" },
          NOT: [
            { email: { endsWith: "@whatsapp.user" } },
            { email: "master@reply.com" },
          ],
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      });
    }

    if (!targetUser) {
      Logger.error(`[AdminService] No valid client users found for company: ${targetCompanyId}.`);
      throw new AppError(
        "No se encontraron usuarios operativos (Admin/Agente) para esta empresa.",
        404,
      );
    }

    Logger.info(`[AdminService] Found user for impersonation: ${targetUser.email} (Role: ${targetUser.role})`);

    // [SEC] Create a real session for impersonation (traceable)
    const { sessionService } = await import("@/services/SessionService");
    const { signAccessToken } = await import("@/controllers/authController");

    const { sessionId, refreshToken } = await sessionService.createSession({
      userId: targetUser.id,
      companyId: targetUser.companyId,
      ip: metadata.ip,
      userAgent: `${metadata.userAgent} (IMPERSONATED)`,
    });

    const token = signAccessToken({
      id: targetUser.id,
      role: targetUser.role,
      email: targetUser.email,
      name: targetUser.name,
      companyId: targetUser.companyId,
      sessionId,
    });

    return { token, refreshToken, user: targetUser };
  },

  // --- METRICS (Delegated to AdminMetricsService) ---

  async getCompanyMetrics(companyId: string) {
    return adminMetricsService.getCompanyMetrics(companyId);
  },

  calculateHealthScore(
    openTickets: number,
    overdueTickets: number,
    users: number,
    whatsappSessions: number,
  ): number {
    return adminMetricsService.calculateHealthScore(
      openTickets,
      overdueTickets,
      users,
      whatsappSessions,
    );
  },

  async getDashboardStats() {
    return adminMetricsService.getDashboardStats();
  },
};
