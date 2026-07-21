import { PrismaClient, Prisma } from "@prisma/client";
import { contextStorage } from "../context/requestContext";
import { Logger } from "@/utils/logger";

/**
 * [SEC] PRISMA DATABASE CONFIGURATION (SINGLE SOURCE OF TRUTH)
 *
 * Capabilities:
 * 1. Connection Pooling Optimized
 * 2. Singleton Pattern (Dev Safe)
 * 3. Soft Deletes (GDPR)
 * 4. Row-Level Security (Tenant Isolation)
 * 5. Robust Connection Retry Logic
 */

// ================= CONSTANTS =================
/**
 * [SEC] GLOBAL MODELS
 * Models in this list BYPASS the automatic companyId filtering.
 * Only add models that are TRULY shared across all tenants or needed for public discovery.
 */
const GLOBAL_MODELS = [
  "Company",
  "Plan",
  "Role",
  "Permission",
  "WhatsAppCredential",
  "Stage",
  // Sin columna companyId propia: el aislamiento de tenant se hereda del
  // Property padre (validado vía assertOwnership antes de cada operación).
  // Sin este bypass, el guard inyecta companyId al create y Prisma lo
  // rechaza con "Unknown argument companyId" (500 al subir fotos).
  "PropertyImage",
];

const SOFT_DELETE_MODELS = ["Contact", "Deal", "Ticket", "Campaign"];

// ================= HELPERS =================

const getDatabaseUrl = (): string => {
  const baseUrl = process.env.DATABASE_URL || "";
  const separator = baseUrl.includes("?") ? "&" : "?";
  // [SEC] ENTERPRISE POOL SIZING:
  // Each PM2/Docker process opens its OWN pool. At 50 connections × N processes,
  // we'd exhaust PostgreSQL's max_connections instantly.
  // Formula: connection_limit = max_db_connections / (api_instances + worker_instances)
  // Conservative: 15 per process → 8 processes = 120 connections (safe for most PG configs).
  // For 1000+ tenants, MANDATORY: Use PgBouncer in Transaction Mode.
  const connLimit = parseInt(process.env.DB_POOL_SIZE || "15", 10);
  const poolParams = [
    `connection_limit=${connLimit}`,
    "pool_timeout=20",
    "connect_timeout=15",
    "keepalives=1",
    "keepalives_idle=30",
    "statement_cache_size=0",
  ].join("&");
  return `${baseUrl}${separator}${poolParams}`;
};

type PrismaModelDelegate = {
  [key: string]:
    | {
        findFirst: (args: unknown) => Promise<unknown>;
        update: (args: unknown) => Promise<unknown>;
        updateMany: (args: unknown) => Promise<unknown>;
      }
    | undefined;
};

// ================= FACTORY =================

const createExtendedClient = () => {
  const basePrisma = new PrismaClient({
    datasources: {
      db: { url: getDatabaseUrl() },
    },
    log:
      process.env.NODE_ENV === "development"
        ? [
            { level: "warn", emit: "event" },
            { level: "error", emit: "event" },
          ]
        : [{ level: "error", emit: "event" }],
  });

  // Log listeners
  basePrisma.$on("warn", (e) => Logger.warn("[Prisma]", e));
  basePrisma.$on("error", (e) => {
    const isTransientConnectionClosed = 
      e.message?.includes("Closed") || 
      e.message?.includes("connection") || 
      e.message?.includes("quaint") || 
      e.message?.includes("P1017");

    if (isTransientConnectionClosed) {
      Logger.warn(`[Prisma] Connection drop event (reconnection handled automatically): ${e.message}`);
    } else {
      Logger.error("[Prisma]", e);
    }
  });

  return basePrisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const maxDbRetries = 3;
          let lastErr: Error | unknown;

          for (let attempt = 1; attempt <= maxDbRetries; attempt++) {
            try {
              // --- 1. GLOBAL BYPASS ---
              if (GLOBAL_MODELS.includes(model)) {
                return await query(args);
              }

              // --- 2. RLS & SECURITY CONTEXT ---
              const store = contextStorage.getStore();
              if (!store) {
                if (process.env.SKIP_SECURITY_CHECK === "true") return await query(args);
                throw new Error(
                  `[ERROR] SECURITY VIOLATION: Access to ${model} denied.`,
                );
              }

              const argsObj = (args || {}) as Record<string, unknown>;
              const isSystem = store.companyId === "__SYSTEM__";
              const companyId = isSystem ? null : store.companyId;

              // --- 2.1 INJECTION LOGIC (Mandatory Tenant Filtering) ---
              if (companyId) {
                const injectToRecord = (target: Record<string, unknown>) => {
                  if (target && typeof target === "object" && !Array.isArray(target)) {
                    // [SEC] SECURITY: Only inject if not already present via relation
                    if (!target.company && !target.companyId) {
                      target.companyId = companyId;
                    }
                  }
                };

                // READS & SCALARS
                const READ_OPS = ["findMany", "findFirst", "findUnique", "findUniqueOrThrow", "count", "aggregate", "groupBy"];
                if (READ_OPS.includes(operation)) {
                  argsObj.where = { ...(argsObj.where as Record<string, unknown> || {}), companyId };
                } 
                // UPDATES & DELETES
                else if (["update", "updateMany", "delete", "deleteMany", "upsert"].includes(operation)) {
                  const where = (argsObj.where as Record<string, unknown>) || {};
                  
                  // Check if there is already a compound unique key containing companyId in its name
                  const compoundKey = Object.keys(where).find(
                    (key) => key.includes("companyId_") || key.includes("_companyId")
                  );
                  
                  if (compoundKey) {
                    // Inject companyId inside the compound unique key object
                    const compoundVal = (where[compoundKey] as Record<string, unknown>) || {};
                    where[compoundKey] = { ...compoundVal, companyId };
                  } else {
                    // Otherwise, safely inject companyId at the top level
                    where.companyId = companyId;
                  }
                  
                  argsObj.where = where;

                  if (argsObj.data) delete (argsObj.data as Record<string, unknown>).companyId;
                  if (argsObj.update) delete (argsObj.update as Record<string, unknown>).companyId;
                  
                  if (operation === "upsert") {
                    if (argsObj.create) injectToRecord(argsObj.create as Record<string, unknown>);
                    // [WARNING] On update part of upsert, we DON'T inject companyId to 'update' data (it's immutable)
                  } 
                  // [WARNING] CRITICAL: We NO LONGER inject companyId into 'data' during standalone updates.
                  // This fixes Prisma collisions and reinforces that companyId is IMMUTABLE after creation.
                }
                // CREATES
                else if (operation === "create" || operation === "createMany") {
                  if (Array.isArray(argsObj.data)) {
                    (argsObj.data as Record<string, unknown>[]).forEach((d) => injectToRecord(d));
                  } else {
                    injectToRecord((argsObj.data as Record<string, unknown>) || {});
                  }
                }
              }

              // --- 3. SOFT DELETE LOGIC ---
              const isSoftDeleteModel = SOFT_DELETE_MODELS.includes(model);
              const includeDeleted = argsObj?.includeDeleted === true;

              if ("includeDeleted" in argsObj) {
                delete argsObj.includeDeleted;
              }

              if (isSoftDeleteModel) {
                const delegateName = model.charAt(0).toLowerCase() + model.slice(1);
                const prismaUnknown = basePrisma as unknown as PrismaModelDelegate;
                const delegate = prismaUnknown[delegateName];

                // Turn DELETE into UPDATE with deletedAt (using base delegate)
                if (delegate) {
                  if (operation === "delete") {
                    // For 'delete', basePrisma allows where id etc. Even if we mutated argsObj.where above to include companyId,
                    // delegate.update on basePrisma will respect it, securing the soft delete!
                    const deleteWhere = companyId
                      ? { ...(argsObj.where as Prisma.JsonObject), companyId }
                      : (argsObj.where as Prisma.JsonObject);
                    return await delegate.update({
                      where: deleteWhere,
                      data: { deletedAt: new Date() },
                    });
                  }
                  if (operation === "deleteMany") {
                    const deleteWhere = companyId
                      ? { ...(argsObj.where as Prisma.JsonObject), companyId }
                      : (argsObj.where as Prisma.JsonObject);
                    return await delegate.updateMany({
                      where: deleteWhere,
                      data: { deletedAt: new Date() },
                    });
                  }
                }

                // Exclude soft-deleted rows from READs
                if (!includeDeleted) {
                  if (
                    [
                      "findFirst",
                      "findMany",
                      "count",
                      "aggregate",
                      "groupBy",
                    ].includes(operation)
                  ) {
                    argsObj.where = { ...(argsObj.where as Prisma.JsonObject), deletedAt: null };
                  }
                }
              }

              // --- 4. FIND UNIQUE HANDLER ---
              // Because 'findUnique' requires strictly unique criteria (like 'id'), we cannot easily add 'companyId' or 'deletedAt'
              // to its 'where' object without Prisma complaining. Therefore, we convert findUnique -> findFirst using the base delegate.
              if (operation === "findUnique" || operation === "findUniqueOrThrow") {
                const delegateName = model.charAt(0).toLowerCase() + model.slice(1);
                const prismaUnknown = basePrisma as unknown as PrismaModelDelegate;
                const delegate = prismaUnknown[delegateName];

                if (delegate?.findFirst) {
                  const findFirstWhere = { ...(argsObj.where as Prisma.JsonObject) };

                  // Flatten compound unique inputs for findFirst compatibility
                  for (const key of Object.keys(findFirstWhere)) {
                    const val = findFirstWhere[key];
                    if (val && typeof val === "object" && !Array.isArray(val)) {
                      const isFilterOperator = Object.keys(val).some((k) =>
                        [
                          "equals",
                          "in",
                          "notIn",
                          "lt",
                          "lte",
                          "gt",
                          "gte",
                          "contains",
                          "startsWith",
                          "endsWith",
                          "not",
                          "mode",
                        ].includes(k),
                      );
                      if (key.includes("_") && !isFilterOperator) {
                        Object.assign(findFirstWhere, val);
                        delete findFirstWhere[key];
                      }
                    }
                  }

                  if (companyId) (findFirstWhere as Prisma.JsonObject).companyId = companyId;
                  if (isSoftDeleteModel && !includeDeleted)
                    (findFirstWhere as Prisma.JsonObject).deletedAt = null;

                  const result = await delegate.findFirst({
                    ...argsObj,
                    where: findFirstWhere,
                  });

                  if (!result && operation === "findUniqueOrThrow") {
                    throw new Error(`Record not found for model ${model}`);
                  }
                  return result;
                }
              }

              // All other standard queries fall through
              return await query(argsObj);
             } catch (err: unknown) {
              lastErr = err;
              
              const errMsg = err instanceof Error ? err.message : String(err);
              const errCode = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : undefined;
              const isConnectionClosed = 
                errCode === "P1017" || 
                errMsg.includes("Server has closed the connection") ||
                errMsg.includes("Closed") ||
                (errMsg.includes("connection") && errMsg.includes("closed")) ||
                errMsg.includes("quaint::connector::postgres::native");

              if (isConnectionClosed && attempt < maxDbRetries) {
                Logger.warn(
                  `[Prisma] Connection closed error detected during operation '${operation}' on model '${model}' (attempt ${attempt}/${maxDbRetries}). Retrying query...`
                );
                // Wait briefly before retrying, backing off slightly
                await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
                continue;
              }
              throw err;
            }
          }
          throw lastErr;
        },
      },
    },
  });
};

// ================= SINGLETON & EXPORTS =================

export type ExtendedPrismaClient = ReturnType<typeof createExtendedClient>;

const globalForPrisma = global as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma || createExtendedClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export const connectDB = async (retries = 5, delay = 2000): Promise<void> => {
  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      Logger.info("[OK] Database connected successfully");
      return;
    } catch (e) {
      Logger.warn(
        `[WARNING] Database connection attempt ${i + 1}/${retries} failed: ${(e as Error).message}`,
      );
      if (i === retries - 1) {
        Logger.error(
          "[ERROR] Critical: Database connection failed after multiple attempts.",
          e,
        );
        process.exit(1);
      }
      await new Promise((res) => setTimeout(res, delay * Math.pow(1.5, i)));
    }
  }
};
