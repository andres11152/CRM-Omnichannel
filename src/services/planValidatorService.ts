
import { Plan } from "../types/index";
import { adminService } from "./adminService";

// Simulating a Redis Cache for Plan Limits
// In production: await redis.get(`company:${companyId}:plan`)
const PLAN_CACHE = new Map<string, string>(); // companyId -> planId

// Simulating DB Count Queries
// In production: await db.users.count({ where: { companyId } })
const RESOURCE_USAGE_MOCK = {
  'comp_123': { users: 2, queues: 2, whatsapp_connections: 1 }, // Current usage
};

export class PlanValidatorService {
  
  /**
   * Get the plan for a specific company.
   * Uses caching to avoid hitting the DB on every request.
   */
  async getCompanyPlan(companyId: string): Promise<Plan> {
    // 1. Check Cache
    let planId = PLAN_CACHE.get(companyId);

    if (!planId) {
      // 2. If miss, mock DB fetch
      // const company = await db.companies.findUnique({ where: { id: companyId } });
      // planId = company.planId;
      planId = 'free'; // Default to free for this mock
      PLAN_CACHE.set(companyId, planId);
    }

    const allPlans = await adminService.getAllPlans();
    const plan = allPlans.find(p => p.id === planId);
    if (!plan) throw new Error("Invalid Plan Configuration");
    
    return plan;
  }

  /**
   * MAIN VALIDATION METHOD
   * Checks if a company can allocate more of a specific resource.
   */
  async canAllocateResource(companyId: string, resource: 'users' | 'queues' | 'whatsapp_connections', currentUserRole?: string): Promise<boolean> {
    // --- SUPER ADMIN BYPASS ---
    // If the user is a 'master' admin, they bypass all plan limitations.
    if (currentUserRole === 'master') {
      console.log(`[PlanValidator] 🛡️  Master user detected. Bypassing limit check for resource '${resource}' on company ${companyId}.`);
      return true;
    }

    // 1. Get Limits
    const plan = await this.getCompanyPlan(companyId);
    
    let limit = 0;
    if (resource === 'users') limit = plan.config.max_users;
    else if (resource === 'queues') limit = plan.config.max_queues;
    else if (resource === 'whatsapp_connections') limit = plan.config.max_whatsapp_connections;

    // 2. Get Current Usage
    // In real app: await db.users.count({ where: { companyId } })
    const currentUsage = RESOURCE_USAGE_MOCK['comp_123']?.[resource] || 0;

    console.log(`[PlanValidator] Checking ${resource}: Used ${currentUsage} / Limit ${limit} (Plan: ${plan.name})`);

    if (currentUsage >= limit) {
      return false;
    }

    return true;
  }

  /**
   * Helper to throw exception directly
   */
  async validateOrThrow(companyId: string, resource: 'users' | 'queues', currentUserRole?: string) {
    const canProceed = await this.canAllocateResource(companyId, resource, currentUserRole);
    if (!canProceed) {
      throw new Error(`PLAN_LIMIT_REACHED: Upgrade your plan to add more ${resource}.`);
    }
  }
}

export const planValidator = new PlanValidatorService();
