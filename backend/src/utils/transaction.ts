import { prisma } from "@/config/database";
import { Logger } from "./logger";
import { getErrorMessage } from "./errorHelpers";

/**
 * [SEC] SAFE TRANSACTION WRAPPER
 *
 * Ensures database operations are atomic and properly rolled back on failure.
 * Prevents partial updates that can corrupt data integrity.
 *
 * @example
 * const result = await safeTransaction(async (tx) => {
 *   const user = await tx.user.create({ data: {...} });
 *   const contact = await tx.contact.create({ data: {...} });
 *   return { user, contact };
 * });
 */

interface TransactionOptions {
  maxRetries?: number;
  timeout?: number; // milliseconds
  isolationLevel?:
    | "ReadUncommitted"
    | "ReadCommitted"
    | "RepeatableRead"
    | "Serializable";
}

export async function safeTransaction<T>(
  operation: (tx: typeof prisma) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const { maxRetries = 3, timeout = 30000, isolationLevel } = options;

  let lastError: Error | undefined;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const result = await prisma.$transaction(operation, {
        maxWait: timeout,
        timeout,
        isolationLevel,
      });

      if (attempt > 0) {
        Logger.info(`[Transaction] [OK] Succeeded after ${attempt + 1} attempts`);
      }

      return result as T;
    } catch (error) {
      attempt++;
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMsg = getErrorMessage(error);

      // Check if error is retryable
      const isRetryable =
        errorMsg.includes("deadlock") ||
        errorMsg.includes("timeout") ||
        errorMsg.includes("connection") ||
        errorMsg.includes("ECONNRESET");

      if (!isRetryable || attempt >= maxRetries) {
        Logger.error(
          `[Transaction] [ERROR] Failed after ${attempt} attempts: ${errorMsg}`,
        );
        throw lastError;
      }

      // Exponential backoff
      const delay = Math.min(100 * Math.pow(2, attempt - 1), 2000);
      Logger.warn(
        `[Transaction] [WARNING] Retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * [SEC] IDEMPOTENT TRANSACTION
 *
 * Ensures operation can be safely retried without creating duplicates.
 * Uses idempotency key to prevent double-execution.
 */
export async function idempotentTransaction<T>(
  idempotencyKey: string,
  operation: (tx: typeof prisma) => Promise<T>,
  ttlSeconds: number = 3600,
): Promise<T> {
  // Check if operation was already executed
  const existing = await prisma.$queryRaw<{ result: T }[]>`
    SELECT result FROM idempotency_cache 
    WHERE key = ${idempotencyKey} 
    AND created_at > NOW() - INTERVAL '${ttlSeconds} seconds'
  `;

  if (existing && existing.length > 0) {
    Logger.info(`[Idempotent] Cache hit for key: ${idempotencyKey}`);
    return existing[0].result as T;
  }

  // Execute and cache result
  const result = await safeTransaction(operation);

  try {
    await prisma.$executeRaw`
      INSERT INTO idempotency_cache (key, result, created_at)
      VALUES (${idempotencyKey}, ${JSON.stringify(result)}, NOW())
      ON CONFLICT (key) DO UPDATE SET result = EXCLUDED.result
    `;
  } catch (error) {
    // Non-critical - log but don't fail
    Logger.warn("[Idempotent] Failed to cache result:", {
      error: getErrorMessage(error),
    });
  }

  return result;
}
