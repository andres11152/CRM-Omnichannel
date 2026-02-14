// Shared TeamAgent interface for Team components
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
  performance: {
    resolved: number;
    csat: number;
  };
  speed: {
    frt: number;
  };
  avatar?: string;
  isAI?: boolean;
  department?: string;
  companyId?: string;
  skills?: string[];
  lastConnectedAt?: string | null;
  totalOnlineSeconds?: number;
}
