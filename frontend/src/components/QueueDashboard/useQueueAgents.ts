import { useState, useEffect } from "react";
import { Agent } from "@/types";
import { API_BASE_URL } from "@/services/apiConfig";
import { getAgents, updateAgentQueues } from "@/services/queueService";
import { getTickets } from "@/services/ticketService";
import { getDepartments, Department } from "@/services/departmentService";
import { getAssistants } from "@/services/aiService";
import { useFeatureFlagStore } from "@/stores/featureFlagStore";
import { socketService } from "@/services/socketService";
import type { QueueConfig } from "@/types";

/** Decodes the current user's id out of the JWT stored in localStorage. */
function getCurrentUserIdFromToken(): string {
  try {
    const token = localStorage.getItem("token");
    if (!token) return "";
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    const payload = JSON.parse(jsonPayload);
    return payload.id || payload.userId || "";
  } catch {
    // malformed/expired token
    return "";
  }
}

/**
 * Loads and keeps live the agent roster shown in the Queue monitor: human
 * agents (filtered to exclude bots/customers/mobile users), virtual AI
 * agents synthesized from configured AI assistants, real-time online/offline
 * status via socket events, and each agent's current open-ticket load.
 */
export function useQueueAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [queues, setQueues] = useState<QueueConfig[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [assistants, setAssistants] = useState<
    Array<{ id: string; name: string; modelName?: string }>
  >([]);

  // Load initial agents and queues
  useEffect(() => {
    const loadData = async () => {
      let humanAgents: Agent[] = [];

      try {
        humanAgents = await getAgents();
      } catch (error) {
        console.error("Error loading agents", error);
      }

      try {
        const queuesRes = await fetch(`${API_BASE_URL}/queues`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
        });
        if (!queuesRes.ok) throw new Error("Endpoint not found");
        const queuesData = await queuesRes.json();
        const mappedQueues = queuesData.map(
          (q: QueueConfig & { department?: { name?: string } | string }) => ({
            ...q,
            departmentDetails: q.department,
            department:
              typeof q.department === "object" && q.department !== null
                ? (q.department as { name?: string }).name
                : q.department, // Fallback
          }),
        );
        setQueues(mappedQueues);
      } catch (error) {
        console.error("Error loading queues:", error);
        setQueues([]); // No mock fallback
      }

      try {
        const depts = await getDepartments();
        setDepartments(depts);
      } catch (error) {
        console.error("Error loading departments", error);
      }

      try {
        const currentUserId = getCurrentUserIdFromToken();

        // AI assistants are an optional add-on (advanced_ai feature flag).
        // Companies without it get a 403 here — that's expected, not fatal,
        // so it must not short-circuit the ticket-load calc / agent filtering below.
        // Skip the call entirely once we know the flag is off, instead of
        // hitting the API and catching the 403 every time.
        let assistantsList: Awaited<ReturnType<typeof getAssistants>> = [];
        const { isLoaded: flagsLoaded, hasFeature } =
          useFeatureFlagStore.getState();
        if (!flagsLoaded || hasFeature("advanced_ai")) {
          try {
            assistantsList = await getAssistants();
          } catch (error) {
            console.warn(
              "AI assistants unavailable (advanced_ai feature likely disabled for this company)",
              error,
            );
          }
        }
        setAssistants(assistantsList);

        // Fetch ALL active tickets to calculate real load
        const realTicketCounts: Record<string, number> = {};
        try {
          const activeTickets = await getTickets(); // Fetching all (or default page).
          activeTickets.forEach((t) => {
            if (
              t.assignedToId &&
              (t.status === "OPEN" || t.status === "IN_PROGRESS")
            ) {
              realTicketCounts[t.assignedToId] =
                (realTicketCounts[t.assignedToId] || 0) + 1;
            }
          });
        } catch (e) {
          console.error("Failed to calculate agent load", e);
        }

        // Create virtual AI agents from assistants
        const aiAgents: Agent[] = assistantsList.map(
          (assistant: { id: string; name: string; modelName?: string }) => ({
            id: `ai-${assistant.id}`,
            name: `[AI] ${assistant.name}`,
            email: `IA Gemini ${assistant.modelName || ""}`,
            avatar: "", // Could use a robot icon
            status: "online" as const, // AI is always online
            currentLoad: 0,
            maxCapacity: 999, // Unlimited for AI
            department: "IA Automation",
            role: "AGENT" as unknown as "AGENT" | "ADMIN" | "SUPERVISOR",
            isAI: true, // Flag to identify AI agents
          }),
        );

        // Filter out human agents that have the same name as AI assistants OR look like bots
        const aiNames = assistantsList.map((a: { name: string }) =>
          a.name.toLowerCase().trim(),
        );
        const filteredHumanAgents = humanAgents.filter((agent) => {
          const nameMatch = aiNames.includes(agent.name.toLowerCase().trim());
          const isBotEmail = agent.email?.toLowerCase().startsWith("bot_");
          // EXCLUDE CUSTOMERS / MOBILE USERS
          const isCustomer =
            agent.email?.endsWith("@whatsapp.user") ||
            agent.email?.endsWith("@c.us");
          const isMobileUser = agent.email?.toLowerCase().startsWith("mobile_");

          // STRICT ROLE CHECK — only allow real staff roles. 'USER' is often
          // default for auto-created contacts/users.
          const allowedRoles = ["AGENT", "ADMIN", "SUPERVISOR", "MASTER"];
          const hasValidRole = allowedRoles.includes(
            agent.role?.toUpperCase() || "",
          );

          return (
            !nameMatch &&
            !isBotEmail &&
            !isMobileUser &&
            !isCustomer &&
            hasValidRole
          );
        });

        // Combine AI agents first, then filtered human agents.
        // FORCE ONLINE STATUS for current user.
        const finalAgents = [...aiAgents, ...filteredHumanAgents].map(
          (agent) => {
            const calculatedLoad =
              realTicketCounts[agent.id] || agent.currentLoad || 0;

            if (agent.id === currentUserId) {
              return {
                ...agent,
                status: "online" as const,
                currentLoad: calculatedLoad,
              };
            }
            return { ...agent, currentLoad: calculatedLoad };
          },
        );

        setAgents(finalAgents);
      } catch (error) {
        console.error("Error loading queue dashboard agents", error);
        // Unexpected failure in the pipeline — show human agents with safe defaults
        const currentUserId = getCurrentUserIdFromToken();
        const finalAgents = humanAgents.map((agent) => ({
          ...agent,
          status: agent.id === currentUserId ? "online" : agent.status,
          currentLoad: agent.currentLoad || 0,
        }));

        setAgents(finalAgents);
      }
    };
    loadData();
  }, []);

  // Real-time Status Updates
  useEffect(() => {
    const handleAgentStatus = (data: {
      id: string;
      status: "online" | "offline";
      lastSeen?: string;
    }) => {
      console.info("[QueueDashboard] Received status update:", data);
      setAgents((prevAgents) =>
        prevAgents.map((agent) => {
          if (agent.id === data.id) {
            return {
              ...agent,
              status: data.status,
              lastSeen: data.lastSeen || agent.lastSeen,
            };
          }
          return agent;
        }),
      );
    };

    socketService.on("agent:status", handleAgentStatus);

    // Initial connection check
    if (!socketService.isConnected) {
      socketService.connect();
    }

    return () => {
      socketService.off("agent:status", handleAgentStatus);
    };
  }, []);

  const saveAgentQueues = async (agentId: string, queueIds: string[]) => {
    const updatedUser = await updateAgentQueues(agentId, queueIds);
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id !== agentId) return a;
        const queueNames = queues
          .filter((q) => queueIds.includes(q.id))
          .map((q) => q.name);
        return {
          ...a,
          queues: queues
            .filter((q) => queueIds.includes(q.id))
            .map((q) => ({ id: q.id, name: q.name })),
          department: queueNames.join(", "),
        };
      }),
    );
    return updatedUser;
  };

  return { agents, setAgents, queues, departments, assistants, saveAgentQueues };
}
