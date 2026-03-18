import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { teamService } from "@/services/teamService";
import { type AgentFormData } from "@/components/team/AgentModal";
import { type TeamAgent } from "@/components/team/types";

export interface UseAgentFormReturn {
  // Form state
  showModal: boolean;
  isEditing: boolean;
  formData: AgentFormData;
  skillInput: string;
  saving: boolean;

  // Actions
  openCreateModal: (defaultDepartment?: string) => void;
  openEditModal: (agent: TeamAgent, defaultDepartment?: string) => void;
  closeModal: () => void;
  updateFormField: (
    field: keyof AgentFormData,
    value: AgentFormData[keyof AgentFormData],
  ) => void;
  setSkillInputValue: (value: string) => void;
  addSkill: (e: React.KeyboardEvent) => void;
  removeSkill: (skill: string) => void;
  saveAgent: () => Promise<boolean>;
}

/**
 * CUSTOM HOOK: useAgentForm (with TanStack Query)
 * Manages all form state and logic for agent creation/editing
 * Uses useMutation for create/update operations with automatic cache invalidation
 *
 * @param onSuccess - Optional callback after successful save
 * @returns {UseAgentFormReturn} Form state and actions
 */
export const useAgentForm = (onSuccess?: () => void): UseAgentFormReturn => {
  const queryClient = useQueryClient();

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<AgentFormData>({
    name: "",
    email: "",
    password: "",
    role: "AGENT",
    department: "",
    maxConcurrency: 5, // Enterprise Default
    skills: [],
  });

  const [skillInput, setSkillInput] = useState("");

  /**
   * CREATE AGENT MUTATION
   * Automatically invalidates 'team-data' query on success
   */
  const createMutation = useMutation({
    mutationFn: (data: AgentFormData) => teamService.createAgent(data),
    onSuccess: () => {
      toast.success("Agente creado correctamente");
      queryClient.invalidateQueries({ queryKey: ["team-data"] });
      closeModal();
      if (onSuccess) onSuccess();
    },
    onError: (error: unknown) => {
      console.error("[useAgentForm] Create error:", error);
      // Error toast is handled by apiClient interceptor
    },
  });

  /**
   * UPDATE AGENT MUTATION
   * Automatically invalidates 'team-data' query on success
   */
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AgentFormData> }) =>
      teamService.updateAgent(id, data),
    onSuccess: () => {
      toast.success("Agente actualizado correctamente");
      queryClient.invalidateQueries({ queryKey: ["team-data"] });
      closeModal();
      if (onSuccess) onSuccess();
    },
    onError: (error: unknown) => {
      console.error("[useAgentForm] Update error:", error);
      // Error toast is handled by apiClient interceptor
    },
  });

  /**
   * OPEN CREATE MODAL
   * Resets form and opens modal for creating new agent
   */
  const openCreateModal = (defaultDepartment?: string) => {
    setIsEditing(false);
    setCurrentAgentId(null);
    setFormData({
      name: "",
      email: "",
      password: "",
      role: "AGENT",
      department: defaultDepartment || "",
      maxConcurrency: 5,
      skills: [],
    });
    setSkillInput("");
    setShowModal(true);
  };

  /**
   * OPEN EDIT MODAL
   * Populates form with agent data for editing
   */
  const openEditModal = (agent: TeamAgent, defaultDepartment?: string) => {
    setIsEditing(true);
    setCurrentAgentId(agent.id);
    setFormData({
      name: agent.name,
      email: agent.email,
      password: "",
      role:
        agent.role === "Supervisor"
          ? "SUPERVISOR"
          : agent.role === "Admin"
            ? "ADMIN"
            : "AGENT",
      department: agent.department || defaultDepartment || "",
      maxConcurrency: agent.maxCapacity || 5,
      skills: agent.skills || [],
    });
    setSkillInput("");
    setShowModal(true);
  };

  /**
   * CLOSE MODAL
   * Resets modal state
   */
  const closeModal = () => {
    setShowModal(false);
    setIsEditing(false);
    setCurrentAgentId(null);
  };

  /**
   * UPDATE FORM FIELD
   * Generic handler for form field changes
   */
  const updateFormField = (
    field: keyof AgentFormData,
    value: AgentFormData[keyof AgentFormData],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  /**
   * SET SKILL INPUT VALUE
   */
  const setSkillInputValue = (value: string) => {
    setSkillInput(value);
  };

  /**
   * ADD SKILL
   * Adds skill when Enter is pressed
   */
  const addSkill = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && skillInput.trim()) {
      e.preventDefault();
      if (!formData.skills.includes(skillInput.trim())) {
        setFormData((prev) => ({
          ...prev,
          skills: [...prev.skills, skillInput.trim()],
        }));
      }
      setSkillInput("");
    }
  };

  /**
   * REMOVE SKILL
   * Removes a skill from the list
   */
  const removeSkill = (skill: string) => {
    setFormData((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s !== skill),
    }));
  };

  /**
   * SAVE AGENT
   * Triggers create or update mutation
   * @returns {boolean} Success status
   */
  const saveAgent = async (): Promise<boolean> => {
    // Validation
    if (!formData.name || !formData.email) {
      toast.error("Nombre y email son requeridos");
      return false;
    }

    if (!isEditing && !formData.password) {
      toast.error("La contraseña es requerida para nuevos agentes");
      return false;
    }

    try {
      if (isEditing && currentAgentId) {
        // Update existing agent
        await updateMutation.mutateAsync({
          id: currentAgentId,
          data: {
            name: formData.name,
            email: formData.email,
            department: formData.department,
            role: formData.role,
            maxConcurrency: formData.maxConcurrency,
            skills: formData.skills,
          },
        });
      } else {
        // Create new agent
        await createMutation.mutateAsync(formData);
      }

      return true;
    } catch (error) {
      return false;
    }
  };

  return {
    // Form state
    showModal,
    isEditing,
    formData,
    skillInput,
    saving: createMutation.isPending || updateMutation.isPending,

    // Actions
    openCreateModal,
    openEditModal,
    closeModal,
    updateFormField,
    setSkillInputValue,
    addSkill,
    removeSkill,
    saveAgent,
  };
};
