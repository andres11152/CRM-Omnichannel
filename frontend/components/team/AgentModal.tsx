import React from "react";

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
  currentUser?: any;

  // Form state
  formData: AgentFormData;
  skillInput: string;
  departments: Array<{ id: string; name: string }>;

  // Handlers
  onClose: () => void;
  onSave: () => void;
  onFormChange: (field: keyof AgentFormData, value: any) => void;
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
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white dark:bg-[#202c33] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-gray-700 transform transition-all scale-100">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-[#2a3942]/50">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">
            {isEditing ? "Editar Agente" : "Nuevo Agente"}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Form Content */}
        <div className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
              Nombre Completo
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => onFormChange("name", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#111b21] rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
              placeholder="Ej: Juan Pérez"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => onFormChange("email", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#111b21] rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
              placeholder="juan@empresa.com"
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
              Rol de Sistema
            </label>
            <select
              value={formData.role}
              onChange={(e) => onFormChange("role", e.target.value)}
              disabled={currentUser?.role === "SUPERVISOR"}
              className={`w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#111b21] rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none ${
                currentUser?.role === "SUPERVISOR"
                  ? "opacity-60 cursor-not-allowed"
                  : ""
              }`}
            >
              <option value="AGENT">🎧 Agente (Miembro)</option>
              {currentUser?.role !== "SUPERVISOR" && (
                <>
                  <option value="SUPERVISOR">👀 Supervisor</option>
                  <option value="ADMIN">🛡️ Administrador</option>
                </>
              )}
            </select>
          </div>

          {/* Password (only for new agents) */}
          {!isEditing && (
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => onFormChange("password", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#111b21] rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                placeholder="••••••••"
              />
            </div>
          )}

          {/* Department */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
              Departamento
            </label>
            <select
              value={formData.department}
              onChange={(e) => onFormChange("department", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#111b21] rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
            >
              {departments.length === 0 ? (
                <option value="">Sin departamentos disponibles</option>
              ) : (
                departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* WFM Section */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
            <h4 className="font-bold text-gray-800 dark:text-white mb-3">
              Gestión de Carga & Habilidades
            </h4>

            {/* Max Concurrency Slider */}
            <div className="mb-4">
              <div className="flex justify-between mb-1.5">
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">
                  Chats Simultáneos (Max)
                </label>
                <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                  {formData.maxConcurrency}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="50"
                step="1"
                value={formData.maxConcurrency}
                onChange={(e) =>
                  onFormChange("maxConcurrency", parseInt(e.target.value))
                }
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-indigo-600"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                El sistema dejará de asignar tickets automáticos al llegar a
                este límite.
              </p>
            </div>

            {/* Skills Tags */}
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                Habilidades (Skills)
              </label>
              <div className="flex flex-wrap gap-2 mb-2 p-2 border border-gray-200 dark:border-gray-700 rounded-lg min-h-[42px] bg-gray-50 dark:bg-black/20">
                {formData.skills.map((skill) => (
                  <span
                    key={skill}
                    className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs px-2 py-1 rounded flex items-center gap-1"
                  >
                    {skill}
                    <button
                      onClick={() => onRemoveSkill(skill)}
                      className="hover:text-red-500"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={skillInput}
                  onChange={(e) => onSkillInputChange(e.target.value)}
                  onKeyDown={onAddSkill}
                  className="bg-transparent outline-none text-sm flex-1 min-w-[60px]"
                  placeholder="Añadir skill..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 pt-2 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm font-semibold transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className={`px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-lg hover:shadow-indigo-500/30 transition-all ${
              saving ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {saving
              ? "Guardando..."
              : isEditing
                ? "Guardar Cambios"
                : "Crear Cuenta"}
          </button>
        </div>
      </div>
    </div>
  );
};
