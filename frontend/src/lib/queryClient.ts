import { QueryClient } from "@tanstack/react-query";

/**
 * QUERY CLIENT CONFIGURATION
 * Global configuration for TanStack Query
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time: how long data is considered fresh
      staleTime: 1000 * 60 * 5, // 5 minutes

      // Cache time: how long unused data stays in cache
      gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime in v4)

      // Retry configuration
      retry: 1,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

      // Refetch configuration
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: true,
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
    },
  },
});
