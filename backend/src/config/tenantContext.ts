import {
  contextStorage,
  RequestContext as TenantContext,
} from "../context/requestContext";

/**
 * [SEC] TENANT CONTEXT MANAGER (ADAPTER)
 *
 * This class now acts as an adapter/facade over the unified 'requestContext' store.
 * It ensures backward compatibility while enforcing a single source of truth for context.
 */

export class TenantContextManager {
  /**
   * Set tenant context for the current async execution chain
   */
  static run<T>(context: TenantContext, callback: () => T): T {
    return contextStorage.run(context, callback);
  }

  /**
   * Get current tenant context
   * @throws Error if context is not set
   */
  static getContext(): TenantContext {
    const context = contextStorage.getStore();

    if (!context) {
      throw new Error(
        "TENANT_CONTEXT_MISSING: Database operation attempted without tenant context.",
      );
    }

    return context;
  }

  /**
   * Get companyId from current context
   */
  static getCompanyId(): string {
    return this.getContext().companyId;
  }

  /**
   * Check if context exists
   */
  static hasContext(): boolean {
    return contextStorage.getStore() !== undefined;
  }

  /**
   * Execute callback WITHOUT tenant context enforcement
   * [WARNING] DANGER: Use ONLY for system operations (migrations, cron jobs, etc.)
   */
  static runAsSystem<T>(callback: () => T | Promise<T>): Promise<T> {
    return contextStorage.run(
      {
        companyId: "__SYSTEM__",
        userId: "system",
        role: "SYSTEM",
        requestId: "system-operation",
      },
      async () => {
        return await callback();
      },
    );
  }
}

export class SecurityError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "SecurityError";
  }
}

export default TenantContextManager;
