import React from "react";
import { useTranslation } from "react-i18next";
import {
  User,
  Mail,
  Lock,
  Shield,
  Building,
  Zap,
  Plus,
  Save,
  UserPlus,
  Settings2,
  Trash2,
} from "lucide-react";
import { Modal, ModalButton } from "@/components/ui/Modal";

export interface AgentFormData {
  name: string;
  email: string;
  password: string;
  role: string;
  department: string;
  maxConcurrency: number;
  skills: string[];
}

interface AgentModalProps {
  show: boolean;
  isEditing: boolean;
  saving: boolean;
  currentUser?: { id: string; role: string } | null;

  // Form state
  formData: AgentFormData;
  skillInput: string;
  departments: Array<{ id: string; name: string }>;

  // Handlers
  onClose: () => void;
  onSave: () => void;
  onFormChange: (
    field: keyof AgentFormData,
    value: AgentFormData[keyof AgentFormData],
  ) => void;
  onSkillInputChange: (value: string) => void;
  onAddSkill: (e: React.KeyboardEvent) => void;
  onRemoveSkill: (skill: string) => void;
}

/**
 * AGENT MODAL COMPONENT
 * Form for creating/editing agents
 */
export const AgentModal: React.FC<AgentModalProps> = ({
  show,
  isEditing,
  saving,
  currentUser,
  formData,
  skillInput,
  departments,
  onClose,
  onSave,
  onFormChange,
  onSkillInputChange,
  onAddSkill,
  onRemoveSkill,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={show}
      onClose={onClose}
      title={isEditing ? t("agent_modal.edit_title", "Editar Agente") : t("agent_modal.create_title", "Nuevo Agente")}
      subtitle={isEditing ? t("agent_modal.edit_desc", "Configuración de perfil") : t("agent_modal.create_desc", "Registro de nuevo miembro")}
      icon={isEditing ? <Settings2 size={22} /> : <UserPlus size={22} />}
      size="xl"
      busy={saving}
      footer={
        <>
          <ModalButton variant="secondary" onClick={onClose}>
            {t("common.cancel", "Cancelar")}
          </ModalButton>
          <ModalButton variant="primary" onClick={onSave} loading={saving}>
            {!saving && <Save size={16} />}
            {saving ? t("agent_modal.processing", "Procesando...") : isEditing ? t("company_settings.save_button", "Guardar Cambios") : t("agent_modal.finish_registration", "Finalizar Registro")}
          </ModalButton>
        </>
      }
    >
        {/* Form Content */}
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* LEFT COLUMN: Identity & Access */}
            <div className="space-y-8">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em]">{t("agent_modal.step_1", "Paso 1")}</span>
                <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">{t("agent_modal.profile_access", "Perfil & Acceso")}</h4>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                  <User size={12} /> {t("agent_modal.full_name", "Nombre Completo")}
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => onFormChange("name", e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-4 text-sm font-bold text-gray-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                  placeholder={t("agent_modal.name_placeholder", "Ej: Juan Pérez")}
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                  <Mail size={12} /> {t("agent_modal.corp_email", "Email Corporativo")}
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => onFormChange("email", e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-4 text-sm font-bold text-gray-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                  placeholder={t("agent_modal.email_placeholder", "juan@reply.com")}
                />
              </div>

              {/* Password */}
              {!isEditing && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                    <Lock size={12} /> {t("agent_modal.access_password", "Contraseña de Acceso")}
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => onFormChange("password", e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-4 text-sm font-bold text-gray-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                    placeholder="••••••••"
                  />
                  <p className="text-[9px] font-bold text-gray-400 mt-2 px-1">{t("agent_modal.password_hint", "Mínimo 8 caracteres, números y símbolos.")}</p>
                </div>
              )}

              {/* Role */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                  <Shield size={12} /> {t("agent_modal.system_role", "Rol de Sistema")}
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => onFormChange("role", e.target.value)}
                  disabled={currentUser?.role === "SUPERVISOR"}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-4 text-sm font-bold text-gray-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none appearance-none"
                >
                  <option value="AGENT">{t("agent_modal.roles.agent", "Agente (Operador)")}</option>
                  {currentUser?.role !== "SUPERVISOR" && (
                    <>
                      <option value="SUPERVISOR">{t("agent_modal.roles.supervisor", "Supervisor")}</option>
                      <option value="ADMIN">{t("agent_modal.roles.admin", "Administrador")}</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* RIGHT COLUMN: Operation & Config */}
            <div className="space-y-8">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em]">{t("agent_modal.step_2", "Paso 2")}</span>
                <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">{t("agent_modal.operation_skills", "Operación & Skills")}</h4>
              </div>

              {/* Department */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                  <Building size={12} /> {t("agent_modal.dept_queue", "Departamento / Fila")}
                </label>
                <select
                  value={formData.department}
                  onChange={(e) => onFormChange("department", e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-4 text-sm font-bold text-gray-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none appearance-none"
                >
                  {departments.length === 0 ? (
                    <option value="">{t("agent_modal.no_depts", "Sin departamentos disponibles")}</option>
                  ) : (
                    departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))
                  )}
                </select>
              </div>

              {/* Max Concurrency Slider */}
              <div className="bg-indigo-500/5 dark:bg-indigo-500/10 p-6 rounded-3xl border border-indigo-500/10">
                <div className="flex justify-between items-end mb-6">
                  <div>
                    <label className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-2 mb-1">
                      <Zap size={12} /> {t("agent_modal.concurrent_chats", "Chats Simultáneos")}
                    </label>
                    <p className="text-[9px] text-gray-400 font-bold uppercase">{t("agent_modal.response_capacity", "Capacidad de respuesta")}</p>
                  </div>
                  <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 tabular-nums bg-white dark:bg-gray-800 px-4 py-2 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900/50">
                    {formData.maxConcurrency}
                  </span>
                </div>
                <input
                  type="range" min="0" max="50" step="1"
                  value={formData.maxConcurrency}
                  onChange={(e) => onFormChange("maxConcurrency", parseInt(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="flex justify-between text-[8px] font-black text-gray-400 mt-4 uppercase tracking-[0.2em]">
                  <span>{t("agent_modal.low_load", "Carga Baja")}</span>
                  <span>{t("agent_modal.critical_load", "Carga Crítica")}</span>
                </div>
              </div>

              {/* Skills Tags */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                  <Plus size={12} /> {t("agent_modal.skills", "Habilidades (Skills)")}
                </label>
                <div className="flex flex-wrap gap-2 p-4 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl min-h-[80px] focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all">
                  {formData.skills.map((skill) => (
                    <span key={skill} className="bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-[10px] font-black px-3 py-2 rounded-xl flex items-center gap-2 shadow-sm border border-gray-100 dark:border-gray-600">
                      {skill}
                      <button onClick={() => onRemoveSkill(skill)} className="text-rose-500 hover:scale-125 transition-transform"><Trash2 size={12} /></button>
                    </span>
                  ))}
                  <input
                    type="text" value={skillInput}
                    onChange={(e) => onSkillInputChange(e.target.value)}
                    onKeyDown={onAddSkill}
                    className="bg-transparent outline-none text-sm font-bold flex-1 min-w-[120px] text-gray-900 dark:text-white placeholder-gray-400"
                    placeholder={t("agent_modal.new_skill", "Nueva habilidad...")}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
    </Modal>
  );
};
