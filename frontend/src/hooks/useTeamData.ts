import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { teamService } from "@/services/teamService";
import { type TeamAgent } from "@/components/team/types";
import { socketService } from "@/services/socketService";

// Interfaces
export interface Department {
  id: string;
  name: string;
}

export interface AIAssistant {
  id: string;
  name: string;
  modelName?: string;
  companyId?: string;
}

export interface UseTeamDataReturn {
  // Data
  agents: TeamAgent[];
  departments: Department[];
  aiAssistants: AIAssistant[];

  // Loading states
  isLoading: boolean;
  error: string | null;

  // Actions
  refreshData: () => Promise<void>;
  refreshAgents: () => void;

  // Filtering
  filterAgents: (query: string) => TeamAgent[];
}

/**
 * CUSTOM HOOK: useTeamData (with TanStack Query)
 * Manages all data fetching and caching for team management
 *
 * Features:
 * - Automatic caching (5 min stale time)
 * - Background refetching
 * - Optimistic updates via invalidation
 * - Error handling with toasts
 *
 * @returns {UseTeamDataReturn} Team data, loading states, and actions
 */
export const useTeamData = (): UseTeamDataReturn => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  /**
   * FETCH ALL TEAM DATA (useQuery)
   * Automatically manages loading, error, and caching states
   */
  const {
    data,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ["team-data"],
    queryFn: async () => {
      try {
        const result = await teamService.fetchAllTeamData();
        return result;
      } catch (err) {
        console.error("[useTeamData] Error loading team data:", err);
        toast.error(t("team_data_hook.toast.load_error", "Error al cargar equipo"));
        throw err;
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes - data is fresh
    gcTime: 1000 * 60 * 10, // 10 minutes - keep in cache
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Extract data with defaults
  const agents = (data?.agents as TeamAgent[]) || [];
  const departments = data?.departments || [];
  const aiAssistants = data?.aiAssistants || [];

  // 100-Year Real-Time Updates
  useEffect(() => {
    const handleStatusUpdate = (payload: {
      id: string;
      status: string;
      lastSeen?: string;
    }) => {
      console.log("[TeamData] Received real-time update:", payload);

      // 1. Optimistic Update (Instant Feedback)
      queryClient.setQueryData(
        ["team-data"],
        (
          oldData:
            | {
                agents: TeamAgent[];
                departments: Department[];
                aiAssistants: AIAssistant[];
              }
            | undefined,
        ) => {
          if (!oldData || !oldData.agents) return oldData;

          return {
            ...oldData,
            agents: oldData.agents.map((agent: TeamAgent) => {
              if (agent.id === payload.id) {
                return {
                  ...agent,
                  status: payload.status,
                  lastConnectedAt: payload.lastSeen || agent.lastConnectedAt,
                };
              }
              return agent;
            }),
          };
        },
      );

      // 2. Background Sync (Ensure Consistency of Counters)
      // Slight delay to allow backend to finish writing session logs if needed
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["team-data"] });
      }, 1000);
    };

    socketService.on("agent:status", handleStatusUpdate);

    return () => {
      socketService.off("agent:status", handleStatusUpdate);
    };
  }, [queryClient]);

  /**
   * REFRESH DATA
   * Manually trigger refetch
   */
  const refreshData = async () => {
    await refetch();
  };

  /**
   * REFRESH AGENTS
   * Invalidate query to trigger automatic refetch
   */
  const refreshAgents = () => {
    queryClient.invalidateQueries({ queryKey: ["team-data"] });
  };

  /**
   * FILTER AGENTS
   * Client-side filtering of agents
   */
  const filterAgents = (query: string): TeamAgent[] => {
    if (!query.trim()) return agents;

    const lowercaseQuery = query.toLowerCase();

    return agents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(lowercaseQuery) ||
        agent.email.toLowerCase().includes(lowercaseQuery) ||
        agent.role.toLowerCase().includes(lowercaseQuery),
    );
  };

  return {
    // Data
    agents,
    departments,
    aiAssistants,

    // Loading states
    isLoading,
    error: queryError ? "Error cargando datos" : null,

    // Actions
    refreshData,
    refreshAgents,

    // Filtering
    filterAgents,
  };
};
