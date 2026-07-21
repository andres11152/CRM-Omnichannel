import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { teamService } from "@/services/teamService";

export interface UseAgentActionsReturn {
  deleteAgent: (id: string, name: string) => Promise<boolean>;
  isDeleting: boolean;
}

/**
 * CUSTOM HOOK: useAgentActions (with TanStack Query)
 * Manages agent actions (delete, etc.) with automatic cache invalidation
 *
 * @param onSuccess - Optional callback after successful action
 * @returns {UseAgentActionsReturn} Action methods
 */
export const useAgentActions = (
  onSuccess?: () => void,
): UseAgentActionsReturn => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  /**
   * DELETE AGENT MUTATION
   * Automatically invalidates 'team-data' query on success
   */
  const deleteMutation = useMutation({
    mutationFn: (id: string) => teamService.deleteAgent(id),
    onSuccess: () => {
      toast.success(t("agent_actions.toast.agent_deleted", "Agente eliminado correctamente"));
      // Invalidate and refetch team data
      queryClient.invalidateQueries({ queryKey: ["team-data"] });
      if (onSuccess) onSuccess();
    },
    onError: (error: unknown) => {
      console.error("[useAgentActions] Delete error:", error);
      // Error toast is handled by apiClient interceptor
    },
  });

  /**
   * DELETE AGENT
   * Deletes an agent with confirmation
   * @returns {boolean} Success status
   */
  const deleteAgent = async (id: string, name: string): Promise<boolean> => {
    // Confirmation dialog
    if (
      !confirm(
        `¿Ests seguro de eliminar a ${name}? Esta acción no se puede deshacer.`,
      )
    ) {
      return false;
    }

    try {
      await deleteMutation.mutateAsync(id);
      return true;
    } catch (error) {
      return false;
    }
  };

  return {
    deleteAgent,
    isDeleting: deleteMutation.isPending,
  };
};
