import { gdprCleanupRepository } from "@/repositories/GdprCleanupRepository";
import { Logger } from "@/utils/logger";
import { runWithCompanyId } from "@/context/requestContext";

const RETENTION_DAYS = 30;

function getRetentionCutoffDate(): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  return cutoff;
}

/**
 * [AUTH] SAFE DELETION HELPER
 * - Centralizes deletion logic (D.R.Y.)
 * - Enforces Tenant Isolation (companyId required)
 * - Uses 'unknown' for proper error handling
 */
async function safelyDeleteRecords(
  modelName: "contact" | "deal" | "ticket" | "campaign",
  companyId: string,
  cutoffDate: Date,
): Promise<number> {
  // [SEC] TENANT ISOLATION: companyId is MANDATORY in the WHERE clause
  const whereClause = {
    companyId: companyId,
    deletedAt: {
      not: null,
      lt: cutoffDate,
    },
  };

  try {
    const count = await runWithCompanyId(companyId, () =>
      gdprCleanupRepository.safelyDeleteRecords(modelName, whereClause)
    );

    if (count > 0) {
      Logger.info(
        `[GDPR Cleanup] ️ Hard deleted ${count} ${modelName}s for Company ${companyId}`,
      );
    }
    return count;
  } catch (error: unknown) {
    // [SEC] Safe Error Handling
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    Logger.error(
      `[GDPR Cleanup] [ERROR] Error cleaning ${modelName} for company ${companyId}: ${errorMessage}`,
    );
    // Non-blocking failure: allows other models/companies to proceed
    return 0;
  }
}

/**
 * [STAT] SAFE STATS HELPER
 */
async function safelyCountRecords(
  modelName: "contact" | "deal" | "ticket" | "campaign",
  companyId: string,
  cutoffDate?: Date,
): Promise<number> {
  const whereClause: {
    companyId: string;
    deletedAt: { not: null; lt?: Date };
  } = {
    companyId,
    deletedAt: { not: null },
  };

  if (cutoffDate) {
    whereClause.deletedAt.lt = cutoffDate;
  }

  try {
    return await runWithCompanyId(companyId, () =>
      gdprCleanupRepository.safelyCountRecords(modelName, whereClause)
    );
  } catch {
    return 0;
  }
}

/**
 * Execute cleanup for a single company
 */
async function processCompanyCleanup(companyId: string, cutoffDate: Date) {
  const [contacts, deals, tickets, campaigns] = await Promise.all([
    safelyDeleteRecords("contact", companyId, cutoffDate),
    safelyDeleteRecords("deal", companyId, cutoffDate),
    safelyDeleteRecords("ticket", companyId, cutoffDate),
    safelyDeleteRecords("campaign", companyId, cutoffDate),
  ]);

  return { contacts, deals, tickets, campaigns };
}

/**
 *  MAIN ENTRY POINT: Run GDPR cleanup for ALL companies
 * Iterates company-by-company to ensure strict isolation.
 */
export async function runGDPRCleanup(): Promise<{
  totalDeleted: number;
  details: {
    contacts: number;
    deals: number;
    tickets: number;
    campaigns: number;
  };
}> {
  Logger.info("[GDPR Cleanup] Starting global cleanup job...");
  const cutoffDate = getRetentionCutoffDate();
  const startTime = Date.now();

  let totalDeleted = 0;
  const details = { contacts: 0, deals: 0, tickets: 0, campaigns: 0 };

  try {
    // 1. Fetch all companies (id only)
    const companies = await gdprCleanupRepository.getCompaniesForCleanup();

    Logger.info(`[GDPR Cleanup] Processing ${companies.length} companies...`);

    // 2. Process sequentially to control load (or parallel with limit if needed)
    // Sequential is safer for database load during cleanup
    for (const company of companies) {
      const result = await processCompanyCleanup(company.id, cutoffDate);

      details.contacts += result.contacts;
      details.deals += result.deals;
      details.tickets += result.tickets;
      details.campaigns += result.campaigns;
      totalDeleted +=
        result.contacts + result.deals + result.tickets + result.campaigns;
    }

    const duration = Date.now() - startTime;
    Logger.info(
      `[GDPR Cleanup] [OK] Completed in ${duration}ms. Total deleted: ${totalDeleted}`,
    );

    return { totalDeleted, details };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.error("[GDPR Cleanup] [ERROR] Global Job Failed:", errorMessage);
    throw error;
  }
}

/**
 * Get statistics about soft-deleted records (Global Aggregation)
 * Safely iterates per company to maintain isolation rules
 */
export async function getSoftDeleteStats(): Promise<{
  contacts: { total: number; readyForCleanup: number };
  deals: { total: number; readyForCleanup: number };
  tickets: { total: number; readyForCleanup: number };
  campaigns: { total: number; readyForCleanup: number };
}> {
  const cutoffDate = getRetentionCutoffDate();

  // Aggregate stats
  const stats = {
    contacts: { total: 0, readyForCleanup: 0 },
    deals: { total: 0, readyForCleanup: 0 },
    tickets: { total: 0, readyForCleanup: 0 },
    campaigns: { total: 0, readyForCleanup: 0 },
  };

  try {
    const companies = await gdprCleanupRepository.getAllCompanyIds();

    for (const company of companies) {
      const [tc, td, tt, tca] = await Promise.all([
        safelyCountRecords("contact", company.id),
        safelyCountRecords("deal", company.id),
        safelyCountRecords("ticket", company.id),
        safelyCountRecords("campaign", company.id),
      ]);

      const [rc, rd, rt, rca] = await Promise.all([
        safelyCountRecords("contact", company.id, cutoffDate),
        safelyCountRecords("deal", company.id, cutoffDate),
        safelyCountRecords("ticket", company.id, cutoffDate),
        safelyCountRecords("campaign", company.id, cutoffDate),
      ]);

      stats.contacts.total += tc;
      stats.contacts.readyForCleanup += rc;
      stats.deals.total += td;
      stats.deals.readyForCleanup += rd;
      stats.tickets.total += tt;
      stats.tickets.readyForCleanup += rt;
      stats.campaigns.total += tca;
      stats.campaigns.readyForCleanup += rca;
    }

    return stats;
  } catch (error: unknown) {
    Logger.error("[GDPR Stats] Failed to aggregate stats:", error);
    throw error;
  }
}
