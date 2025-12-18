import { prisma } from "@/config/prisma";
import { cacheService } from "@/services/cacheService";

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
  companyId: string
): Promise<PlanLimits | null> {
  return cacheService.wrap(
    `company:${companyId}:plan`,
    async () => {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        include: { plan: true },
      });

      if (!company?.plan) {
        return null;
      }

      const config = (company.plan.config as any) || {};
      const plan = company.plan;

      // Normalize config keys to match interface, preferring DB columns
      return {
        max_users: config.max_users ?? 1,
        max_whatsapp_sessions:
          config.max_whatsapp_connections ??
          config.max_whatsapp_sessions ??
          config.max_whatsapp ??
          1,
        max_queues: config.max_queues ?? 1,
        max_tickets_per_month: config.max_tickets_per_month ?? -1,
        max_ai_assistants: config.max_ai_assistants ?? 1,

        // New Columns (DB is source of truth, fallback to config for legacy)
        storage_limit_gb:
          plan.storageLimitGb !== null
            ? plan.storageLimitGb
            : config.storage_limit_gb ?? -1,
        max_contacts:
          plan.maxContacts !== null
            ? plan.maxContacts
            : config.max_contacts ?? -1,
        max_companies:
          plan.maxCompanies !== null
            ? plan.maxCompanies
            : config.max_companies ?? -1,
        max_workflows:
          plan.maxWorkflows !== null
            ? plan.maxWorkflows
            : config.max_workflows ?? -1,
      } as PlanLimits;
    },
    300 // 5 minutes TTL (plans rarely change)
  );
}

/**
 * Get current usage stats for a company
 */
export async function getCurrentUsage(companyId: string): Promise<UsageStats> {
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
    companies, // Assuming Account model implies 'Empresas' in CRM context
    workflows,
  ] = await Promise.all([
    prisma.user.count({
      where: {
        companyId,
        role: { in: ["AGENT", "ADMIN", "MASTER"] },
      },
    }),
    prisma.whatsAppSession.count({ where: { companyId } }),
    prisma.queue.count({ where: { companyId } }),
    prisma.ticket.count({
      where: {
        companyId,
        createdAt: { gte: startOfMonth },
      },
    }),
    prisma.aIAssistant.count({ where: { companyId } }),
    prisma.media.aggregate({ where: { companyId }, _sum: { size: true } }), // Using 'media' table size column
    prisma.contact.count({ where: { companyId } }),
    prisma.account.count({ where: { companyId } }), // CRM Companies/Accounts
    prisma.flow.count({ where: { companyId, isActive: true } }), // Active workflows only
  ]);

  return {
    users,
    whatsapp_sessions: whatsappSessions,
    queues,
    tickets_this_month: ticketsThisMonth,
    ai_assistants: aiAssistants,
    storage_bytes: storageAgg._sum.size || 0,
    contacts,
    companies,
    workflows,
  };
}

/**
 * Check if a specific resource limit has been reached
 */
export async function checkPlanLimit(
  companyId: string,
  resourceType: keyof UsageStats | "storage" // 'storage' is special case
): Promise<LimitCheckResult> {
  const limits = await getPlanLimits(companyId);
  const usage = await getCurrentUsage(companyId);

  if (!limits) {
    // No plan = no limits (for MASTER or special cases)
    return {
      allowed: true,
      limit: -1,
      current: 0,
      percentage: 0,
    };
  }

  // Helper to resolve limit value based on resource type
  let limit = -1;
  let current = 0;

  switch (resourceType) {
    case "storage":
      limit = limits.storage_limit_gb ?? -1;
      current =
        Math.round((usage.storage_bytes / (1024 * 1024 * 1024)) * 100) / 100; // GB
      break;
    case "contacts":
      limit = limits.max_contacts ?? -1;
      current = usage.contacts;
      break;
    case "companies":
      limit = limits.max_companies ?? -1;
      current = usage.companies;
      break;
    case "workflows":
      limit = limits.max_workflows ?? -1;
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
  amount: number = 1 // Amount to add (usually 1, or bytes for storage)
): Promise<boolean> {
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
}

export const planLimitsService = {
  getPlanLimits,
  getCurrentUsage,
  checkPlanLimit,
  canCreateResource,
};
