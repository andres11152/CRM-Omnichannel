import { companyRepository } from "@/repositories/CompanyRepository";
import { statsRepository } from "@/repositories/StatsRepository";
import { cacheService } from "@/services/CacheService";
import { Logger } from "@/utils/logger";

export interface PlanLimits {
  max_users: number;
  max_whatsapp_sessions: number;
  max_queues: number;
  max_tickets_per_month?: number;
  max_ai_assistants?: number;
  storage_limit_gb?: number;
  max_contacts?: number;
  max_companies?: number;
  max_workflows?: number;
  // Feature Flags
  enable_ai?: boolean;
  enable_api?: boolean;
  enable_whitelabel?: boolean;
}

export interface UsageStats {
  users: number;
  whatsapp_sessions: number;
  queues: number;
  tickets_this_month: number;
  ai_assistants: number;
  // New Quotas
  storage_bytes: number;
  contacts: number;
  companies: number;
  workflows: number;
}

export interface LimitCheckResult {
  allowed: boolean;
  limit: number;
  current: number;
  percentage: number;
}

/**
 * Get plan limits for a company (cached for 5 minutes)
 */
export async function getPlanLimits(
  companyId: string,
): Promise<PlanLimits | null> {
  // Cache v2 forces invalidation of old boolean/string mismatch data
  return cacheService.wrap(
    `company:${companyId}:plan:v2`,
    async () => {
      const companyOutput = await companyRepository.findUnique({
        where: { id: companyId },
        include: { plan: true },
      });
      const company = companyOutput as typeof companyOutput & {
        plan?: {
          config: unknown;
          storageLimitGb: number | null;
          maxContacts: number | null;
          maxCompanies: number | null;
          maxWorkflows: number | null;
        };
      };

      if (!company?.plan) {
        return null;
      }

      /**
       * Interface defining the structure of the Plan Configuration JSON.
       * This ensures type safety for all plan-related feature flags and limits.
       */
      interface PlanConfig {
        max_users?: number;
        maxLimitUsers?: number;
        max_whatsapp_connections?: number;
        max_whatsapp_sessions?: number;
        max_whatsapp?: number;
        max_queues?: number;
        max_tickets_per_month?: number;
        max_ai_assistants?: number;
        // Feature flags can be boolean or string due to legacy data
        can_use_ai?: boolean | string;
        enable_ai?: boolean;
        can_use_api?: boolean | string;
        enable_api?: boolean;
        can_remove_branding?: boolean | string;
        enable_whitelabel?: boolean;
        // Resource limits
        storage_limit_gb?: number;
        max_contacts?: number;
        max_companies?: number;
        max_workflows?: number;
      }

      const config = (company.plan.config as unknown as PlanConfig) || {};
      const plan = company.plan;

      // Normalize config keys to match interface, preferring DB columns
      // Robust mapping handles both boolean and string 'true'/'false' values
      const limits = {
        // Frontend Key: max_users
        max_users: config.max_users || config.maxLimitUsers || 1,

        // Frontend Key: max_whatsapp_connections (legacy: max_whatsapp_sessions)
        max_whatsapp_sessions:
          config.max_whatsapp_connections ??
          config.max_whatsapp_sessions ??
          config.max_whatsapp ??
          1,

        // Frontend Key: max_queues
        max_queues: config.max_queues || 1,

        max_tickets_per_month: config.max_tickets_per_month || -1,
        max_ai_assistants: config.max_ai_assistants || 1,

        // New Feature Flags (Frontend Keys: can_use_ai, can_use_api, can_remove_branding)
        // Must handle boolean true/false AND string 'true'/'false' from select inputs
        enable_ai:
          config.can_use_ai === true ||
          config.can_use_ai === "true" ||
          config.enable_ai === true,
        enable_api:
          config.can_use_api === true ||
          config.can_use_api === "true" ||
          config.enable_api === true,
        enable_whitelabel:
          config.can_remove_branding === true ||
          config.can_remove_branding === "true" ||
          config.enable_whitelabel === true,

        // Resource Limits (DB is source of truth, fallback to config)
        storage_limit_gb:
          plan.storageLimitGb !== null
            ? plan.storageLimitGb
            : (config.storage_limit_gb || -1),
        max_contacts:
          plan.maxContacts !== null
            ? plan.maxContacts
            : (config.max_contacts || -1),
        max_companies:
          plan.maxCompanies !== null
            ? plan.maxCompanies
            : (config.max_companies || -1),
        max_workflows:
          plan.maxWorkflows !== null
            ? plan.maxWorkflows
            : (config.max_workflows || -1),
      } as PlanLimits;

      return limits;
    },
    300, // 5 minutes TTL (Standard production value)
  );
}

/**
 * Get current usage stats for a company
 */
export async function getCurrentUsage(companyId: string): Promise<UsageStats> {
  //  PERFORMANCE: Cache usage stats for 60s to reduce parallel query spikes on Dashboard || load
  return cacheService.wrap(
    `company:${companyId}:usage:v1`,
    async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [
        users,
        whatsappSessions,
        queues,
        ticketsThisMonth,
        aiAssistants,
        storageAgg,
        contacts,
        companies,
        workflows,
      ] = await Promise.all([
        statsRepository.countUsers({
          where: {
            companyId,
            role: { in: ["AGENT", "ADMIN", "MASTER"] },
          },
        }),
        statsRepository.countWhatsAppSessions({ where: { companyId } }),
        statsRepository.countQueues({ where: { companyId } }),
        statsRepository.countTickets({
          where: {
            companyId,
            createdAt: { gte: startOfMonth },
          },
        }),
        statsRepository.countAIAssistants({ where: { companyId } }),
        statsRepository.sumMediaSize(companyId),
        statsRepository.countContacts({ where: { companyId } }),
        statsRepository.countAccounts({ where: { companyId } }),
        statsRepository.countWorkflows({
          where: { companyId, isActive: true },
        }),
      ]);

      return {
        users,
        whatsapp_sessions: whatsappSessions,
        queues,
        tickets_this_month: ticketsThisMonth,
        ai_assistants: aiAssistants,
        storage_bytes: storageAgg,
        contacts,
        companies,
        workflows,
      };
    },
    60, // 1 minute TTL
  );
}

/**
 * Check if a specific resource limit has been reached
 */
export async function checkPlanLimit(
  companyId: string,
  resourceType: keyof UsageStats | "storage", // 'storage' is special case
): Promise<LimitCheckResult> {
  const limits = await getPlanLimits(companyId);
  const usage = await getCurrentUsage(companyId);

  if (!limits) {
    // [SEC] SECURITY FIX: Fail-Safe. If no plan is assigned, DENY access.
    // Master accounts should have a specific Plan assigned (e.g., "Internal Admin")
    return {
      allowed: false,
      limit: 0,
      current: 0,
      percentage: 100,
    };
  }

  // Helper to resolve limit value based on resource type
  let limit = -1;
  let current = 0;

  switch (resourceType) {
    case "storage":
      limit = limits.storage_limit_gb;
      current =
        Math.round((usage.storage_bytes / (1024 * 1024 * 1024)) * 100) / 100; // GB
      break;
    case "contacts":
      limit = limits.max_contacts;
      current = usage.contacts;
      break;
    case "companies":
      limit = limits.max_companies;
      current = usage.companies;
      break;
    case "workflows":
      limit = limits.max_workflows;
      current = usage.workflows;
      break;
    case "users":
      limit = limits.max_users;
      current = usage.users;
      break;
    case "whatsapp_sessions":
      limit = limits.max_whatsapp_sessions;
      current = usage.whatsapp_sessions;
      break;
    case "queues":
      limit = limits.max_queues;
      current = usage.queues;
      break;
    default:
      limit = -1;
  }

  // -1 means unlimited
  if (limit === -1) {
    return { allowed: true, limit: -1, current, percentage: 0 };
  }

  const allowed = current < limit;
  const percentage = Math.round((current / limit) * 100);

  return { allowed, limit, current, percentage };
}

/**
 * Check if company can create a new resource of given type
 */
export async function canCreateResource(
  companyId: string,
  resourceType: keyof UsageStats | "storage",
  amount: number = 1, // Amount to add (usually 1, or bytes for storage)
): Promise<boolean> {
  try {
    if (resourceType === "storage") {
      const limits = await getPlanLimits(companyId);
      const usage = await getCurrentUsage(companyId);
      const limitGb = limits?.storage_limit_gb ?? -1;

      if (limitGb === -1) return true;

      const currentGb = usage.storage_bytes / (1024 * 1024 * 1024);
      const incomingGb = amount / (1024 * 1024 * 1024);

      return currentGb + incomingGb <= limitGb;
    }

    const result = await checkPlanLimit(companyId, resourceType);
    if (result.limit === -1) return true;
    return result.current + amount <= result.limit;
  } catch (error) {
    Logger.error("[PlanLimitsService] Error checking limits:", error);
    // Fail safe: If there's an error in limits, allow operation (or block based on policy)
    // For debugging, we return true but log the error
    return true;
  }
}

/**
 * Invalidate plan cache for specific companies (e.g. after plan update)
 */
export async function invalidatePlanCache(companyIds: string[]): Promise<void> {
  if (companyIds.length === 0) return;

  const keys = companyIds.map((id) => `company:${id}:plan:v2`);
  await cacheService.deleteMany(keys);
}

export const planLimitsService = {
  getPlanLimits,
  invalidatePlanCache, // Export new method
  getCurrentUsage,
  checkPlanLimit,
  canCreateResource,
};

