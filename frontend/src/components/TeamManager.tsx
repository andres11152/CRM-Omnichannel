import React, { useState } from "react";
import { ModuleHeader } from "./common/ModuleHeader";
import PermissionsPanel from "./PermissionsPanel";
import { useAuthStore } from "@/stores/authStore";
import { Users, Shield, UserPlus } from "lucide-react";

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
    <div className="h-full flex flex-col bg-[#F8FAFC] dark:bg-reply-bg-dark transition-colors duration-200 font-sans">
      {/* Header */}
      <ModuleHeader
        title="Gestión de Equipo"
        description="Supervisa el rendimiento y estado de tus agentes en tiempo real."
        icon={<Users size={32} className="text-white" />}
        gradient="from-[#4F46E5] via-[#6366F1] to-[#8B5CF6] dark:from-indigo-900 dark:to-violet-900"
        stats={{
          label: "Agentes Online",
          value: agents.filter((a) => a.status === "online" && !a.isAI).length,
        }}
        action={
          <button
            onClick={handleCreateAgent}
            className="group relative bg-white dark:bg-reply-panel-dark text-indigo-600 dark:text-indigo-400 px-6 py-3 rounded-2xl font-black transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest shadow-[0_10px_20px_-10px_rgba(79,70,229,0.3)] hover:shadow-[0_20px_40px_-15px_rgba(79,70,229,0.4)] hover:-translate-y-0.5 active:scale-95 border border-indigo-100 dark:border-indigo-500/20"
          >
            <UserPlus size={18} className="transition-transform group-hover:scale-110" />
            <span className="whitespace-nowrap">Nuevo Agente</span>
          </button>
        }
      />

      {/* Navigation Tabs */}
      <div className="px-4 md:px-8 pt-6 bg-transparent z-10 shrink-0">
        <div className="flex gap-1 md:gap-4 border-b border-gray-200 dark:border-reply-border-dark overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveView("team")}
            className={`group px-6 py-4 font-black text-xs uppercase tracking-[0.2em] transition-all border-b-2 whitespace-nowrap flex items-center gap-3 ${
              activeView === "team"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
          >
            <Users size={16} className={`${activeView === "team" ? "text-indigo-600" : "text-gray-400 group-hover:text-gray-600"} transition-colors`} />
            Equipo
          </button>
          <button
            onClick={() => setActiveView("permissions")}
            className={`group px-6 py-4 font-black text-xs uppercase tracking-[0.2em] transition-all border-b-2 whitespace-nowrap flex items-center gap-3 ${
              activeView === "permissions"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
          >
            <Shield size={16} className={`${activeView === "permissions" ? "text-indigo-600" : "text-gray-400 group-hover:text-gray-600"} transition-colors`} />
            Permisos y Roles
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
