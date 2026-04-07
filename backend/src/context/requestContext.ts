import { AsyncLocalStorage } from "async_hooks";

export interface RequestContext {
  companyId: string;
  userId?: string;
  role?: string;
  requestId?: string;
}

/**
 * Global Context Store for the Request Life-Cycle
 * This eliminates the need to pass `companyId` through every single function.
 */
export const contextStorage = new AsyncLocalStorage<RequestContext>();

export const getContext = (): RequestContext => {
  const store = contextStorage.getStore();
  if (!store) {
    throw new Error(
      "[ERROR] SECURITY VIOLATION: Operation attempted outside of an active request context.",
    );
  }
  return store;
};

export const getCompanyId = (): string => {
  const { companyId } = getContext();
  if (!companyId) {
    throw new Error(
      "[ERROR] SECURITY VIOLATION: No Company ID found in current context.",
    );
  }
  return companyId;
};

/**
 * [DEV] SYSTEM EXECUTION CONTEXT
 * Allows bypassing standard RLS for administrative or discovery tasks (like LOGIN).
 */
export const runAsSystem = <T>(fn: () => T | Promise<T>): T | Promise<T> => {
  return contextStorage.run({ companyId: "__SYSTEM__" }, fn);
};

/**
 * [DEV] CUSTOM COMPANY CONTEXT
 * Explicitly sets a company context (useful for background jobs or webhooks).
 */
export const runWithCompanyId = <T>(
  companyId: string,
  fn: () => T | Promise<T>,
): T | Promise<T> => {
  return contextStorage.run({ companyId }, fn);
};
