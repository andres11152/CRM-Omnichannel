import { useEffect } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import { useSocketStore } from "@/stores/socketStore";

/**
 * Global Socket Initializer — called once in MainLayout.
 * 
 * Responsibilities:
 *   1. Initialize the centralized socket store on auth
 *   2. Register global notification listeners (agent_assigned toast)
 *   3. Teardown on logout
 */
export const useSocketInit = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const { initialize, teardown, subscribe } = useSocketStore();

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    // Initialize centralized socket connection + room management
    initialize(user.role, user.id, user.companyId);

    // Global notification: agent_assigned (CRM-wide toast)
    const unsubscribe = subscribe<{ ticketId: string; agentName: string }>(
      "agent_assigned",
      (payload) => {
        toast.info(
          `Ticket ${payload.ticketId} asignado a ${payload.agentName}`,
          { description: "Nueva asignación desde la cola." },
        );
      },
    );

    return () => {
      unsubscribe();
      teardown();
    };
  }, [isAuthenticated, user?.id]);
};
