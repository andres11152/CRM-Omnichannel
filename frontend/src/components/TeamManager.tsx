import React, { useState } from "react";
import { ModuleHeader } from "./common/ModuleHeader";
import PermissionsPanel from "./PermissionsPanel";
import { useAuthStore } from "@/stores/authStore";

// Import atomic components
import { TeamMetrics } from "./team/TeamMetrics";
import { TeamTable } from "./team/TeamTable";
import { AgentModal } from "./team/AgentModal";

// Import custom hooks
import { useTeamData } from "@/hooks/useTeamData";
import { useAgentForm } from "@/hooks/useAgentForm";
import { useAgentActions } from "@/hooks/useAgentActions";

/**
 * TEAM MANAGER COMPONENT (ORCHESTRATOR)
 * Manages view state and coordinates child components
 * Business logic is delegated to custom hooks
 */
export const TeamManager: React.FC = () => {
  const { user: currentUser } = useAuthStore();

  // View state (only UI state remains in component)
  const [activeView, setActiveView] = useState<"team" | "permissions">("team");

  // Custom hooks (all business logic extracted)
  const { agents, departments, isLoading, refreshAgents } = useTeamData();

  const agentForm = useAgentForm(refreshAgents);
  const agentActions = useAgentActions(refreshAgents);

  // Handle new agent creation
  const handleCreateAgent = () => {
    const defaultDept = departments.length > 0 ? departments[0].id : "";
    agentForm.openCreateModal(defaultDept);
  };

  // Handle agent edit
  const handleEditAgent = (
    agent: import("@/components/team/types").TeamAgent,
  ) => {
    const defaultDept = departments.length > 0 ? departments[0].id : "";
    agentForm.openEditModal(agent, defaultDept);
  };

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark transition-colors duration-200 font-sans">
      {/* Header */}
      <ModuleHeader
        title="Gestión de Equipo"
        description="Supervisa el rendimiento y estado de tus agentes en tiempo real."
        icon={
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
        }
        gradient="from-indigo-600 to-violet-600 dark:from-indigo-800 dark:to-violet-800"
        stats={{
          label: "Agentes Online",
          value: agents.filter((a) => a.status === "online" && !a.isAI).length,
        }}
        action={
          <button
            onClick={handleCreateAgent}
            className="bg-white/20 hover:bg-white/30 text-white px-4 md:px-5 py-2 md:py-2.5 rounded-lg font-semibold backdrop-blur-sm border border-white/20 transition-all flex items-center justify-center gap-2 text-xs md:text-sm shadow-lg shadow-black/10 active:scale-95"
          >
            <svg
              className="w-4 md:w-5 h-4 md:h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span className="whitespace-nowrap">Nuevo Agente</span>
          </button>
        }
      />

      {/* Navigation Tabs */}
      <div className="px-4 md:px-8 pt-4 bg-reply-bg dark:bg-reply-bg-dark z-10 shrink-0">
        <div className="flex gap-1 md:gap-2 border-b border-gray-200 dark:border-reply-border-dark overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveView("team")}
            className={`px-4 md:px-6 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap ${
              activeView === "team"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 md:w-5 md:h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
              Equipo
            </div>
          </button>
          <button
            onClick={() => setActiveView("permissions")}
            className={`px-4 md:px-6 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap ${
              activeView === "permissions"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 md:w-5 md:h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              Permisos y Roles
            </div>
          </button>
        </div>
      </div>

      {/* Content Area - Fixed height with single scrollable container */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 bg-reply-bg dark:bg-reply-bg-dark">
        {activeView === "permissions" ? (
          <div className="p-0">
            <PermissionsPanel />
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Metrics Cards - Now inside the scrollable container */}
            <TeamMetrics agents={agents} />

            {/* Table Section */}
            <div className="px-4 md:px-8 pb-8">
              <TeamTable
                agents={agents}
                loading={isLoading}
                currentUser={currentUser}
                onEdit={handleEditAgent}
                onDelete={agentActions.deleteAgent}
                onCreateNew={handleCreateAgent}
              />
            </div>
          </div>
        )}
      </div>

      {/* Agent Modal */}
      <AgentModal
        show={agentForm.showModal}
        isEditing={agentForm.isEditing}
        saving={agentForm.saving}
        currentUser={currentUser}
        formData={agentForm.formData}
        skillInput={agentForm.skillInput}
        departments={departments}
        onClose={agentForm.closeModal}
        onSave={agentForm.saveAgent}
        onFormChange={agentForm.updateFormField}
        onSkillInputChange={agentForm.setSkillInputValue}
        onAddSkill={agentForm.addSkill}
        onRemoveSkill={agentForm.removeSkill}
      />
    </div>
  );
};
