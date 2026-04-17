import { prisma, ExtendedPrismaClient } from "@/config/database";

/**
 * [BUILD] BASE REPOSITORY (Enterprise Standard)
 *
 * Rules:
 * 1. EVERY method that touches data MUST require companyId as the first argument.
 * 2. No 'any' passthrough. All arguments must be strictly typed.
 * 3. Atomic scoping: companyId is enforced at the repository level even if Prisma Extension is active (Defense in Depth).
 */
export abstract class BaseRepository {
  protected db: ExtendedPrismaClient;

  constructor(db: ExtendedPrismaClient = prisma) {
    this.db = db;
  }

  /**
   * Helper to ensure objects are scoped correctly before generic operations
   */
  protected scopeWhere(
    companyId: string,
    where: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return { ...where, companyId };
  }
}
