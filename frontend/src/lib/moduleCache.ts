// In-memory stale-while-revalidate cache for module pages.
//
// Pages that fetch on mount store their last successful payload here so that
// navigating back to the module renders instantly with the previous data
// (no skeleton flash) while the fresh fetch runs silently in the background.
// Lives only for the SPA session: cleared on logout (never leak one account's
// data into another) and naturally empty after a full page reload.

const cache = new Map<string, unknown>();

export function getModuleCache<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function setModuleCache<T>(key: string, value: T): void {
  cache.set(key, value);
}

export function clearModuleCache(): void {
  cache.clear();
}
