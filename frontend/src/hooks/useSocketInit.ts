import { useEffect } from "react";
import { toast } from "sonner";
// Service is in root/services, so we go up from hooks -> src -> root
import { socketService } from "../../services/socketService";
import { useAuthStore } from "../stores/authStore";

export const useSocketInit = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    socketService.connect();

    // Type payload loosely for now as we integrate
    const handleAgentAssigned = (payload: any) => {
      // console.log("Socket Event:", payload); // Removed for prod
      toast.info(`Ticket ${payload.ticketId} asignado a ${payload.agentName}`, {
        description: "Nueva asignación desde la cola.",
      });
      // Play sound if needed (requires SoundContext hook)
    };

    socketService.on("agent_assigned", handleAgentAssigned);

    return () => {
      socketService.off("agent_assigned", handleAgentAssigned);
    };
  }, [isAuthenticated]);
};
