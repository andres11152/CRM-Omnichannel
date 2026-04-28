import { prisma, ExtendedPrismaClient } from "@/config/database";
import TenantContextManager from "@/config/tenantContext";

/**
 * [SEC] BASE REPOSITORY (Guardian Layer)
 * 
 * This class implements Defense in Depth. It automatically scopes all queries
 * using the current RequestContext (Tenant isolation).
 */
export abstract class BaseRepository {
  protected db: ExtendedPrismaClient;

  constructor(db: ExtendedPrismaClient = prisma) {
    this.db = db;
  }

  /**
   * [SEC] Force inclusion of companyId in any Prisma args.
   * Scopes the query to the current tenant automatically.
   */
  protected applyTenantFilter<T extends { where?: Record<string, unknown> }>(
    args: T,
    companyIdOverride?: string
  ): T {
    const companyId = companyIdOverride || TenantContextManager.getCompanyId();

    if (!companyId) {
      throw new Error("TENANT_ISOLATION_ERROR: Operation attempted without companyId context.");
    }

    // Bypass for system operations
    if (companyId === "__SYSTEM__") {
      return args;
    }

    return {
      ...args,
      where: {
        ...(args.where || {}),
        companyId,
      } as T["where"],
    };
  }

  /**
   * Helper to ensure objects are scoped correctly before generic operations
   */
  protected scopeWhere(
    where: Record<string, unknown> = {},
    companyIdOverride?: string
  ): Record<string, unknown> {
    const companyId = companyIdOverride || TenantContextManager.getCompanyId();
    
    if (!companyId) {
       throw new Error("TENANT_ISOLATION_ERROR: companyId is mandatory for scoping.");
    }

    if (companyId === "__SYSTEM__") return where;

    return { ...where, companyId };
  }
}
