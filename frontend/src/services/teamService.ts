import { api } from "./apiClient";

// ==================== TYPES & INTERFACES ====================

/** Raw user shape as returned by the backend /users endpoint */
interface RawUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isOwner?: boolean;
  maxConcurrency?: number;
  skills?: string[];
  department?: string;
  companyId?: string;
  avatar?: string;
  [key: string]: unknown; // allow extra fields
}
export interface TeamAgent {
  id: string;
  name: string;
  email: string;
  role: "Admin" | "Supervisor" | "Agent" | "AI_AGENT";
  isOwner?: boolean;
  status: "online" | "away" | "offline" | "busy";
  statusDuration: string;
  currentLoad: number;
  maxCapacity: number;
  skills?: string[];
  performance: {
    resolved: number;
    csat: number;
  };
  speed: {
    frt: number; // First Response Time
  };
  department?: string;
  companyId?: string;
  avatar?: string;
  isAI?: boolean;
}

export interface CreateAgentInput {
  name: string;
  email: string;
  password: string;
  role?: string;
  department?: string;
  maxConcurrency?: number;
  skills?: string[];
}

export interface UpdateAgentInput {
  name?: string;
  email?: string;
  role?: string;
  department?: string;
  maxConcurrency?: number;
  skills?: string[];
  preferences?: Record<string, unknown>;
  queueIds?: string[];
  profilePicUrl?: string;
}

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

export interface AgentMetrics {
  userId: string;
  status: "online" | "away" | "offline" | "busy";
  statusDuration: string;
  currentLoad: number;
  maxCapacity: number;
  performance: {
    resolved: number;
    csat: number;
  };
  speed: {
    frt: number;
  };
}

// ==================== TEAM SERVICE ====================

export const teamService = {
  /**
   * GET AGENTS
   * Fetches all team members (agents and supervisors)
   */
  async getAgents(): Promise<{ data: { users: RawUser[] } }> {
    const response = await api.get<{ data: { users: RawUser[] } }>("/users");
    return response;
  },

  /**
   * GET AGENT METRICS
   * Fetches real-time metrics for all agents
   */
  async getAgentMetrics(): Promise<{ data: { metrics: AgentMetrics[] } }> {
    try {
      const response = await api.get<{ data: { metrics: AgentMetrics[] } }>(
        "/users/metrics",
      );
      return response;
    } catch (error) {
      // Metrics are optional, return empty if fails
      console.warn("[TeamService] Failed to fetch metrics:", error);
      return { data: { metrics: [] } };
    }
  },

  /**
   * GET DEPARTMENTS
   * Fetches all departments
   */
  async getDepartments(): Promise<Department[]> {
    const response = await api.get<
      { data: { departments: Department[] } } | Department[]
    >("/departments");

    // Handle both response formats
    if (Array.isArray(response)) {
      return response;
    } else if (
      (response as { data: { departments: Department[] } })?.data?.departments
    ) {
      return (response as { data: { departments: Department[] } }).data
        .departments;
    }

    return [];
  },

  /**
   * GET AI ASSISTANTS
   * Fetches AI assistants configured for the company
   */
  async getAIAssistants(): Promise<AIAssistant[]> {
    try {
      const response = await api.get<AIAssistant[]>("/ai/assistants");
      return response || [];
    } catch (error) {
      // AI assistants are optional
      console.warn("[TeamService] No AI assistants or failed to load:", error);
      return [];
    }
  },

  /**
   * CREATE AGENT
   * Creates a new team member
   */
  async createAgent(
    agentData: CreateAgentInput,
  ): Promise<{ data: { user: RawUser } }> {
    const response = await api.post<{ data: { user: RawUser } }>(
      "/users",
      agentData,
    );
    return response;
  },

  /**
   * UPDATE AGENT
   * Updates an existing team member
   */
  async updateAgent(
    agentId: string,
    agentData: UpdateAgentInput,
  ): Promise<{ data: { user: RawUser } }> {
    const response = await api.patch<{ data: { user: RawUser } }>(
      `/users/${agentId}`,
      agentData,
    );
    return response;
  },

  /**
   * DELETE AGENT
   * Removes a team member
   */
  async deleteAgent(agentId: string): Promise<void> {
    await api.delete(`/users/${agentId}`);
  },

  // ==================== DATA TRANSFORMATION ====================

  /**
   * TRANSFORM AGENTS DATA
   * Combines users data with metrics and formats for UI
   */
  transformAgentsData(
    users: RawUser[],
    metrics: AgentMetrics[],
    aiAssistants: AIAssistant[],
  ): TeamAgent[] {
    // Create metrics map for quick lookup
    const metricsMap = new Map<string, AgentMetrics>();
    metrics.forEach((m) => metricsMap.set(m.userId, m));

    // Filter for AGENT and SUPERVISOR roles
    const rawAgents = users.filter((user) =>
      ["AGENT", "SUPERVISOR", "ADMIN"].includes(user.role),
    );

    // Create AI virtual agents
    const aiAgents: TeamAgent[] = aiAssistants.map((assistant) => ({
      id: `ai-${assistant.id}`,
      companyId: assistant.companyId || "system",
      name: `🤖 ${assistant.name}`,
      email: `IA Gemini ${assistant.modelName || ""}`,
      role: "AI_AGENT",
      isOwner: false,
      status: "online",
      statusDuration: "∞",
      department: "IA Automation",
      currentLoad: 0,
      maxCapacity: 999,
      avatar: "",
      performance: { resolved: 0, csat: 0 },
      speed: { frt: 0 },
      isAI: true,
    }));

    // Filter out bot users and AI duplicates
    const aiNames = aiAssistants.map((a) => a.name.toLowerCase().trim());

    const humanAgents: TeamAgent[] = rawAgents
      .filter((agent: RawUser) => {
        const isBotEmail = agent.email?.toLowerCase().startsWith("bot_");
        const nameMatch = aiNames.includes(agent.name.toLowerCase().trim());
        const isMeUser = agent.name.toLowerCase() === "me";
        return !isBotEmail && !nameMatch && !isMeUser;
      })
      .map((agent: RawUser) => {
        const agentMetrics: Partial<AgentMetrics> =
          metricsMap.get(agent.id) || {};

        return {
          ...agent,
          role: this.mapRole(agent.role),
          isOwner: agent.isOwner || false,
          status: agentMetrics.status || "offline",
          statusDuration: agentMetrics.statusDuration || "-",
          currentLoad: agentMetrics.currentLoad || 0,
          maxCapacity: agent.maxConcurrency || 3,
          skills: agent.skills || [],
          performance: {
            resolved: agentMetrics.performance?.resolved || 0,
            csat: agentMetrics.performance?.csat || 0,
          },
          speed: {
            frt: agentMetrics.speed?.frt || 0,
          },
          isAI: false,
        };
      });

    return [...aiAgents, ...humanAgents];
  },

  /**
   * MAP ROLE
   * Converts backend role to frontend display role
   */
  mapRole(backendRole: string): "Admin" | "Supervisor" | "Agent" | "AI_AGENT" {
    switch (backendRole) {
      case "ADMIN":
        return "Admin";
      case "SUPERVISOR":
        return "Supervisor";
      case "AGENT":
        return "Agent";
      default:
        return "Agent";
    }
  },

  /**
   * FETCH ALL TEAM DATA
   * Fetches users, metrics, departments, and AI assistants in parallel
   */
  async fetchAllTeamData(): Promise<{
    agents: TeamAgent[];
    departments: Department[];
    aiAssistants: AIAssistant[];
  }> {
    // Fetch all data in parallel for performance
    const [usersResponse, metricsResponse, departments, aiAssistants] =
      await Promise.all([
        this.getAgents(),
        this.getAgentMetrics(),
        this.getDepartments(),
        this.getAIAssistants(),
      ]);

    // Extract users from response
    const users = usersResponse?.data?.users || [];
    const metrics = metricsResponse?.data?.metrics || [];

    // Transform and combine data
    const agents = this.transformAgentsData(users, metrics, aiAssistants);

    return {
      agents,
      departments,
      aiAssistants,
    };
  },
};
