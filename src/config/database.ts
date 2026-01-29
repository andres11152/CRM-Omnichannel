import { PrismaClient } from "@prisma/client";
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
];

const SOFT_DELETE_MODELS = ["Contact", "Deal", "Ticket", "Campaign"];

// ================= HELPERS =================

const getDatabaseUrl = (): string => {
  const baseUrl = process.env.DATABASE_URL || "";
  const separator = baseUrl.includes("?") ? "&" : "?";
  // Optimized for stability over performance in Dev env
  const poolParams = [
    "connection_limit=10", // Reduced from 20 to prevent exhaustion
    "pool_timeout=60", // Increased to allow recovery
    "connect_timeout=60",
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
          // --- 1. SOFT DELETE LOGIC ---
          // Allows bypass via 'includeDeleted' in args (custom logic required in calling code to pass this arg typings,
          // or we treat args as unknown record)
          const argsObj = args as Record<string, unknown>;
          const includeDeleted = argsObj?.includeDeleted === true;

          if (argsObj && "includeDeleted" in argsObj) {
            delete argsObj.includeDeleted;
          }

          if (SOFT_DELETE_MODELS.includes(model)) {
            const delegateName = model.charAt(0).toLowerCase() + model.slice(1);
            const prismaUnknown = basePrisma as unknown as MyPrismaAny;
            const delegate = prismaUnknown[delegateName];

            if (delegate) {
              if (operation === "delete") {
                // Redirect delete -> update
                return delegate.update({
                  where: args.where,
                  data: { deletedAt: new Date() },
                });
              }
              if (operation === "deleteMany") {
                return delegate.updateMany({
                  where: args.where,
                  data: { deletedAt: new Date() },
                });
              }
            }

            // Read filtering
            if (!includeDeleted) {
              if (
                [
                  "findUnique",
                  "findFirst",
                  "findMany",
                  "count",
                  "aggregate",
                  "groupBy", // Added groupBy to safe list
                ].includes(operation)
              ) {
                const safeArgs = args as { where?: Record<string, unknown> };
                safeArgs.where = {
                  ...safeArgs.where,
                  deletedAt: null,
                };
                // Note: findUnique cannot accept extra filters unless we redirect to findFirst.
                // RLS logic below handles findingFirst for findUnique redirect.
                // If we don't redirect here, findUnique will fail with extra field.
              }
            }
          }

          // --- 2. GLOBAL BYPASS ---
          if (GLOBAL_MODELS.includes(model)) {
            return query(args);
          }

          // --- 3. SECURITY CHECK & RLS ---
          const store = contextStorage.getStore();

          if (!store) {
            // Allow 'system' context bypass if needed, strictly block otherwise
            Logger.error(`🚨 SECURITY BLOCK: ${model}.${operation} no context`);
            // throw new Error(`❌ SECURITY VIOLATION: Access to ${model} denied.`);
            // Temporarily removed throw to allow generic system access until audited fully.
            // As '100 year solution', blocking is correct, but let's be safe on migration.
            // Re-enabling strict blocking:
            throw new Error(
              `❌ SECURITY VIOLATION: Access to ${model} denied.`,
            );
          }

          // --- 3.1 SYSTEM BYPASS ---
          if (store.companyId === "__SYSTEM__") {
            return query(args);
          }

          const companyId = getCompanyId();

          // Inject companyId
          const injectCompanyId = (target: unknown) => {
            if (target && typeof target === "object" && target !== null) {
              (target as Record<string, unknown>).companyId = companyId;
            }
          };

          if (operation === "create") {
            // Structural typing: Treat args as an object with specific shape for middleware manipulation
            const typedArgs = args as { data?: Record<string, unknown> };
            if (!typedArgs.data) {
              typedArgs.data = {};
            }
            injectCompanyId(typedArgs.data);
          } else if (operation === "createMany") {
            if (Array.isArray(args.data)) {
              args.data.forEach((d: unknown) => injectCompanyId(d));
            }
          } else if (operation === "findUnique") {
            // Redirect findUnique -> findFirst to allow companyId filter
            const delegateName = model.charAt(0).toLowerCase() + model.slice(1);
            const prismaUnknown = basePrisma as unknown as MyPrismaAny;
            const delegate = prismaUnknown[delegateName];

            if (delegate?.findFirst) {
              return delegate.findFirst({
                ...args,
                where: { ...args.where, companyId },
              });
            }
          } else if (
            [
              "findMany",
              "findFirst",
              "count",
              "deleteMany",
              "updateMany",
              "groupBy",
              "aggregate",
            ].includes(operation)
          ) {
            const safeArgs = args as { where?: Record<string, unknown> };
            safeArgs.where = {
              ...safeArgs.where,
              companyId,
            };
          }

          return query(args);
        },
      },
    },
  });
};

// ================= SINGLETON & EXPORTS =================

const globalForPrisma = global as unknown as {
  prisma: ReturnType<typeof createExtendedClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createExtendedClient();
// Raw client for system ops (bypass RLS)
// Note: We access the underlying client via a hack or simpler: create a new one.
// Ideally we expose a system method. For "100-Year", we should expose a safe system accessor.
// For now, exporting the extended client is the standard. Backdoor access should be explicit.

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export const connectDB = async (retries = 5, delay = 2000): Promise<void> => {
  for (let i = 0; i < retries; i++) {
    try {
      // Create a focused timeout scope for connection
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
      await new Promise((res) => setTimeout(res, delay * Math.pow(1.5, i))); // Exponential backoff
    }
  }
};
