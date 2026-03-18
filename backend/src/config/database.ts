import { PrismaClient, Prisma } from "@prisma/client";
import { getCompanyId, contextStorage } from "../context/requestContext";
import { Logger } from "@/utils/logger";

/**
 * 🛡️ PRISMA DATABASE CONFIGURATION (SINGLE SOURCE OF TRUTH)
 *
 * Capabilities:
 * 1. Connection Pooling Optimized
 * 2. Singleton Pattern (Dev Safe)
 * 3. Soft Deletes (GDPR)
 * 4. Row-Level Security (Tenant Isolation)
 * 5. Robust Connection Retry Logic
 */

// ================= CONSTANTS =================
const GLOBAL_MODELS = [
  "Company",
  "User",
  "Plan",
  "ApiKey",
  "Webhook",
  "WhatsAppCredential",
  "TestModel",
  // Exempt models from legacy extensions:
  "Notification",
  "Permission",
  "RolePermission",
  "Stage",
  "WhatsAppSession",
  "AIConfig",
  "AIAssistant",
  "Media",
  "AgentSession",
  "BillingTransaction",
];

const SOFT_DELETE_MODELS = ["Contact", "Deal", "Ticket", "Campaign"];

// ================= HELPERS =================

const getDatabaseUrl = (): string => {
  const baseUrl = process.env.DATABASE_URL || "";
  const separator = baseUrl.includes("?") ? "&" : "?";
  // 🚀 PERFORMANCE FIX: Increased connection limit for better concurrency.
  // 25 was still too low for burst traffic (health probes + API calls + background jobs).
  // pool_timeout reduced to 30s to release stale connections faster under load.
  const poolParams = [
    "connection_limit=40",
    "pool_timeout=30",
    "connect_timeout=30",
  ].join("&");
  return `${baseUrl}${separator}${poolParams}`;
};

type MyPrismaAny = {
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
  basePrisma.$on("error", (e) => Logger.error("[Prisma]", e));

  return basePrisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // --- 1. GLOBAL BYPASS ---
          if (GLOBAL_MODELS.includes(model)) {
            return query(args);
          }

          // --- 2. RLS & SECURITY CONTEXT ---
          const store = contextStorage.getStore();
          if (!store) {
            if (process.env.SKIP_SECURITY_CHECK === "true") return query(args);
            throw new Error(
              `❌ SECURITY VIOLATION: Access to ${model} denied.`,
            );
          }

          const argsObj = args as Record<string, Prisma.JsonValue | Prisma.JsonValue[] | undefined>;
          const isSystem = store.companyId === "__SYSTEM__";
          const companyId = isSystem ? null : getCompanyId();

          // Inject companyId into args if not system
          if (companyId) {
            const injectCompanyId = (target: Prisma.JsonObject) => {
              if (target && typeof target === "object" && !Array.isArray(target) && target !== null) {
                const record = target as Prisma.JsonObject;
                if (!record.company) record.companyId = companyId;
              }
            };

            if (operation === "create") {
              if (!argsObj.data) argsObj.data = {};
              if (!Array.isArray(argsObj.data)) {
                injectCompanyId(argsObj.data as Prisma.JsonObject);
              }
            } else if (operation === "createMany") {
              if (Array.isArray(argsObj.data)) {
                (argsObj.data as Prisma.JsonObject[]).forEach((d) => injectCompanyId(d));
              }
            } else if (operation === "upsert") {
              if (argsObj.where) (argsObj.where as Prisma.JsonObject).companyId = companyId;
              if (argsObj.create) injectCompanyId(argsObj.create as Prisma.JsonObject);
            } else if (
              [
                "findMany",
                "findFirst",
                "count",
                "delete",
                "deleteMany",
                "update",
                "updateMany",
                "groupBy",
                "aggregate",
              ].includes(operation)
            ) {
              if (argsObj.where) {
                argsObj.where = { ...(argsObj.where as Prisma.JsonObject), companyId };
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
            const prismaUnknown = basePrisma as unknown as MyPrismaAny;
            const delegate = prismaUnknown[delegateName];

            // Turn DELETE into UPDATE with deletedAt (using base delegate)
            if (delegate) {
              if (operation === "delete") {
                // For 'delete', basePrisma allows where id etc. Even if we mutated argsObj.where above to include companyId,
                // delegate.update on basePrisma will respect it, securing the soft delete!
                const deleteWhere = companyId
                  ? { ...(argsObj.where as Prisma.JsonObject), companyId }
                  : (argsObj.where as Prisma.JsonObject);
                return delegate.update({
                  where: deleteWhere,
                  data: { deletedAt: new Date() },
                });
              }
              if (operation === "deleteMany") {
                const deleteWhere = companyId
                  ? { ...(argsObj.where as Prisma.JsonObject), companyId }
                  : (argsObj.where as Prisma.JsonObject);
                return delegate.updateMany({
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
            const prismaUnknown = basePrisma as unknown as MyPrismaAny;
            const delegate = prismaUnknown[delegateName];

            if (delegate?.findFirst) {
              const findFirstWhere = { ...(argsObj.where as Prisma.JsonObject) };
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
          return query(argsObj);
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

export const prisma = globalForPrisma.prisma ?? createExtendedClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export const connectDB = async (retries = 5, delay = 2000): Promise<void> => {
  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      Logger.info("✅ Database connected successfully");
      return;
    } catch (e) {
      Logger.warn(
        `⚠️ Database connection attempt ${i + 1}/${retries} failed: ${(e as Error).message}`,
      );
      if (i === retries - 1) {
        Logger.error(
          "❌ Critical: Database connection failed after multiple attempts.",
          e,
        );
        process.exit(1);
      }
      await new Promise((res) => setTimeout(res, delay * Math.pow(1.5, i)));
    }
  }
};
