import { prisma } from "@/config/prisma";
import { cacheService } from "@/services/cacheService";

export interface PlanLimits {
  max_users: number;
  max_whatsapp_sessions: number;
  max_queues: number;
  max_tickets_per_month?: number;
  max_ai_assistants?: number;
}

export interface UsageStats {
  users: number;
  whatsapp_sessions: number;
  queues: number;
  tickets_this_month: number;
  ai_assistants: number;
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

      return company.plan.config as unknown as PlanLimits;
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

  const [users, whatsappSessions, queues, ticketsThisMonth, aiAssistants] =
    await Promise.all([
      prisma.user.count({ where: { companyId } }),
      prisma.whatsAppSession.count({ where: { companyId } }),
      prisma.queue.count({ where: { companyId } }),
      prisma.ticket.count({
        where: {
          companyId,
          createdAt: { gte: startOfMonth },
        },
      }),
      prisma.aIAssistant.count({ where: { companyId } }),
    ]);

  return {
    users,
    whatsapp_sessions: whatsappSessions,
    queues,
    tickets_this_month: ticketsThisMonth,
    ai_assistants: aiAssistants,
  };
}

/**
 * Check if a specific resource limit has been reached
 */
export async function checkPlanLimit(
  companyId: string,
  resourceType: keyof UsageStats
): Promise<LimitCheckResult> {
  const limits = await getPlanLimits(companyId);
  const usage = await getCurrentUsage(companyId);

  if (!limits) {
    // No plan = no limits (for MASTER or special cases)
    return {
      allowed: true,
      limit: -1,
      current: usage[resourceType],
      percentage: 0,
    };
  }

  const limitKey = `max_${resourceType}` as keyof PlanLimits;
  const limit = limits[limitKey] ?? -1;
  const current = usage[resourceType];

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
  resourceType: keyof UsageStats
): Promise<boolean> {
  const result = await checkPlanLimit(companyId, resourceType);
  return result.allowed;
}

export const planLimitsService = {
  getPlanLimits,
  getCurrentUsage,
  checkPlanLimit,
  canCreateResource,
};
