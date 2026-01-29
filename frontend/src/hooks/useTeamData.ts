import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { teamService } from "../../services/teamService";
import { type TeamAgent } from "../../components/team/types";

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
        toast.error("Error cargando datos del equipo");
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
        agent.role.toLowerCase().includes(lowercaseQuery)
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
