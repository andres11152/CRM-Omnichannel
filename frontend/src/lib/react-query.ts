import { QueryClient } from "@tanstack/react-query";

// Central QueryClient configuration
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // ⏳ Cache Time: Data remains "fresh" for 5 minutes.
      // During this time, re-mounting components won't trigger a fetch.
      staleTime: 1000 * 60 * 5,

      // 🔄 Retries: Only retry once on failure (avoids spamming backend on hard errors)
      retry: 1,

      // 🚫 Focus: Don't auto-refetch when user focuses window (saves resources/flicker)
      refetchOnWindowFocus: false,

      // 🚫 Reconnect: Don't auto-refetch on network reconnect (optional, keeps UI stable)
      refetchOnReconnect: false,
    },
    mutations: {
      // Default mutation behavior
      retry: 0,
    },
  },
});
