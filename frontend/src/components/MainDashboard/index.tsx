import React from "react";
import { User, UserRole } from "@/types";
import { MasterAdminDashboard } from "./MasterAdminDashboard";
import { AgentDashboard } from "./AgentDashboard";
import { CompanyAdminDashboard } from "./CompanyAdminDashboard";

interface Props {
  role: UserRole | string;
  onNavigate?: (tab: string) => void;
  user?: User;
  onUserUpdate?: (user: Partial<User>) => void;
}

export const MainDashboard: React.FC<Props> = ({
  role,
  onNavigate,
  user,
  onUserUpdate,
}) => {
  // Route to appropriate dashboard based on role
  if (role === "master" || role === "MASTER") {
    return <MasterAdminDashboard onNavigate={onNavigate} />;
  }

  if (role === "AGENT") {
    // [BUILD] AGENT DASHBOARD: Personalized, focused, gamified.
    return <AgentDashboard user={user} onNavigate={onNavigate} />;
  }

  return (
    <CompanyAdminDashboard
      onNavigate={onNavigate}
      user={user}
      onUserUpdate={onUserUpdate}
    />
  );
};
