import React from "react";
import { useTranslation } from "react-i18next";
import { ModuleHeader } from "./common/ModuleHeader";
import { useAuthStore } from "@/stores/authStore";
import { Users, UserPlus } from "lucide-react";

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
  const { t } = useTranslation();
  const { user: currentUser } = useAuthStore();

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
        title={t("team.title", "Gestión de Equipo")}
        description={t("team.subtitle", "Supervisa el rendimiento y estado de tus agentes en tiempo real.")}
        icon={<Users size={32} className="text-white" />}
        gradient="from-[#4F46E5] via-[#6366F1] to-[#8B5CF6] dark:from-indigo-900 dark:to-violet-900"
        stats={{
          label: t("team.online_agents", "Agentes Online"),
          value: agents.filter((a) => a.status === "online" && !a.isAI).length,
        }}
        action={
          <button
            onClick={handleCreateAgent}
            className="group relative bg-white dark:bg-reply-panel-dark text-indigo-600 dark:text-indigo-400 px-6 py-3 rounded-2xl font-black transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest shadow-[0_10px_20px_-10px_rgba(79,70,229,0.3)] hover:shadow-[0_20px_40px_-15px_rgba(79,70,229,0.4)] hover:-translate-y-0.5 active:scale-95 border border-indigo-100 dark:border-indigo-500/20"
          >
            <UserPlus size={18} className="transition-transform group-hover:scale-110" />
            <span className="whitespace-nowrap">{t("team.new_agent", "Nuevo Agente")}</span>
          </button>
        }
      />

      {/* Content Area - Fixed height with single scrollable container */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 bg-reply-bg dark:bg-reply-bg-dark">
        <div className="flex flex-col">
          {/* Metrics Cards */}
          <TeamMetrics agents={agents} />

          {/* Table Section */}
          <div className="px-4 md:px-8 pt-6 pb-8">
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
