import { prisma } from "@/config/database";
import { Logger } from "@/utils/logger";
import { Prisma } from "@prisma/client";

const RETENTION_DAYS = 30;

function getRetentionCutoffDate(): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  return cutoff;
}

// 🛡️ TYPE DEFINITION: Safe Interface for Middleware-Extended Models
// Replaces 'as any' with a strictly defined contract
interface ExtendedSoftDeleteDelegate {
  deleteMany(args: {
    where: { companyId: string; [key: string]: any }; // Enforce companyId in arguments
    includeDeleted?: boolean;
  }): Promise<Prisma.BatchPayload>;

  count(args: {
    where: { companyId: string; [key: string]: any };
    includeDeleted?: boolean;
  }): Promise<number>;
}

/**
 * Helper to get model safely
 */
function getModel(modelName: "contact" | "deal" | "ticket" | "campaign") {
  switch (modelName) {
    case "contact":
      return prisma.contact;
    case "deal":
      return prisma.deal;
    case "ticket":
      return prisma.ticket;
    case "campaign":
      return prisma.campaign;
    default:
      return null;
  }
}

/**
 * 🔐 SAFE DELETION HELPER
 * - Centralizes deletion logic (D.R.Y.)
 * - Enforces Tenant Isolation (companyId required)
 * - Uses 'unknown' for proper error handling
 */
async function safelyDeleteRecords(
  modelName: "contact" | "deal" | "ticket" | "campaign",
  companyId: string,
  cutoffDate: Date,
): Promise<number> {
  const model = getModel(modelName);
  if (!model) return 0;

  // 🛡️ TENANT ISOLATION: companyId is MANDATORY in the WHERE clause
  const whereClause = {
    companyId: companyId,
    deletedAt: {
      not: null,
      lt: cutoffDate,
    },
  };

  try {
    // Safe cast to interface defining the middleware method 'includeDeleted'
    const delegate = model as unknown as ExtendedSoftDeleteDelegate;

    const result = await delegate.deleteMany({
      where: whereClause,
      includeDeleted: true,
    });

    if (result.count > 0) {
      Logger.info(
        `[GDPR Cleanup] 🗑️ Hard deleted ${result.count} ${modelName}s for Company ${companyId}`,
      );
    }
    return result.count;
  } catch (error: unknown) {
    // 🛡️ Safe Error Handling
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    Logger.error(
      `[GDPR Cleanup] ❌ Error cleaning ${modelName} for company ${companyId}: ${errorMessage}`,
    );
    // Non-blocking failure: allows other models/companies to proceed
    return 0;
  }
}

/**
 * 📊 SAFE STATS HELPER
 */
async function safelyCountRecords(
  modelName: "contact" | "deal" | "ticket" | "campaign",
  companyId: string,
  cutoffDate?: Date,
): Promise<number> {
  const model = getModel(modelName);
  if (!model) return 0;

  const whereClause: any = {
    companyId,
    deletedAt: { not: null },
  };

  if (cutoffDate) {
    whereClause.deletedAt.lt = cutoffDate;
  }

  try {
    const delegate = model as unknown as ExtendedSoftDeleteDelegate;
    return await delegate.count({
      where: whereClause,
      includeDeleted: true,
    });
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
 * 🚀 MAIN ENTRY POINT: Run GDPR cleanup for ALL companies
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
    const companies = await prisma.company.findMany({
      select: { id: true },
      where: { status: { not: "BANNED" } }, // Optional optimization
    });

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
      `[GDPR Cleanup] ✅ Completed in ${duration}ms. Total deleted: ${totalDeleted}`,
    );

    return { totalDeleted, details };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.error("[GDPR Cleanup] ❌ Global Job Failed:", errorMessage);
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
    const companies = await prisma.company.findMany({ select: { id: true } });

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
