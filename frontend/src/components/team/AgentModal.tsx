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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fade-in">
      <div className="bg-white dark:bg-reply-panel-dark rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-gray-200 dark:border-reply-border-dark transform transition-all scale-100 flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        {/* Header */}
        <div className="px-5 md:px-8 py-4 md:py-5 border-b border-gray-100 dark:border-reply-border-dark flex justify-between items-center bg-reply-bg/50 dark:bg-reply-border-dark/50">
          <h3 className="text-lg md:text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
            {isEditing ? (
              <>
                <span className="p-1.5 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
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
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </span>
                Editar Agente
              </>
            ) : (
              <>
                <span className="p-1.5 bg-green-100 dark:bg-green-900/30 rounded-lg text-green-600 dark:text-green-400">
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
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                    />
                  </svg>
                </span>
                Nuevo Agente
              </>
            )}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1.5 md:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
          >
            <svg
              className="w-5 h-5 md:w-6 md:h-6"
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

        {/* Form Content - Horizontal Layout */}
        <div className="p-5 md:p-8 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
            {/* LEFT COLUMN: Identity & Access */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100 dark:border-reply-border-dark">
                <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Perfil & Acceso
                </span>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => onFormChange("name", e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                  placeholder="Ej: Juan Pérez"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  Email Corporativo
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => onFormChange("email", e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                  placeholder="juan@empresa.com"
                />
              </div>

              {/* Password (only for new agents) */}
              {!isEditing && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => onFormChange("password", e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    placeholder="••••••••"
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    Mínimo 8 caracteres, incluye números y símbolos.
                  </p>
                </div>
              )}

              {/* Role */}
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  Rol de Sistema
                </label>
                <div className="relative">
                  <select
                    value={formData.role}
                    onChange={(e) => onFormChange("role", e.target.value)}
                    disabled={currentUser?.role === "SUPERVISOR"}
                    className={`w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none appearance-none ${
                      currentUser?.role === "SUPERVISOR"
                        ? "opacity-60 cursor-not-allowed"
                        : ""
                    }`}
                  >
                    <option value="AGENT">🎧 Agente (Operador)</option>
                    {currentUser?.role !== "SUPERVISOR" && (
                      <>
                        <option value="SUPERVISOR">👀 Supervisor</option>
                        <option value="ADMIN">🛡️ Administrador</option>
                      </>
                    )}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-500">
                    <svg
                      className="w-4 h-4 ml-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Operation & Config */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100 dark:border-reply-border-dark">
                <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Operación & Skills
                </span>
              </div>

              {/* Department */}
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  Departamento
                </label>
                <div className="relative">
                  <select
                    value={formData.department}
                    onChange={(e) => onFormChange("department", e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none appearance-none"
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
                  <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-500">
                    <svg
                      className="w-4 h-4 ml-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Max Concurrency Slider */}
              <div className="bg-reply-bg dark:bg-reply-surface-dark p-5 rounded-xl border border-gray-100 dark:border-reply-border-dark">
                <div className="flex justify-between mb-4">
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                    Chats Simultáneos
                  </label>
                  <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 font-bold px-2 py-0.5 rounded text-sm">
                    {formData.maxConcurrency === 0
                      ? "Sin Asignación Automática"
                      : formData.maxConcurrency}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="1"
                  value={formData.maxConcurrency}
                  onChange={(e) =>
                    onFormChange("maxConcurrency", parseInt(e.target.value))
                  }
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-indigo-600"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-2 font-medium uppercase tracking-wide">
                  <span>Baja Carga</span>
                  <span>Alta Carga</span>
                </div>
              </div>

              {/* Skills Tags */}
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  Habilidades (Skills)
                </label>
                <div className="flex flex-wrap gap-2 mb-2 p-3 border border-gray-300 dark:border-gray-600 rounded-xl min-h-[52px] bg-white dark:bg-reply-surface-dark focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-al">
                  {formData.skills.map((skill) => (
                    <span
                      key={skill}
                      className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 border border-indigo-100 dark:border-indigo-800/50"
                    >
                      {skill}
                      <button
                        onClick={() => onRemoveSkill(skill)}
                        className="hover:text-red-500 transition-colors"
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
                    className="bg-transparent outline-none text-sm flex-1 min-w-[80px] text-gray-900 dark:text-white placeholder-gray-400"
                    placeholder="Escribe y presiona Enter..."
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Usadas para el enrutamiento inteligente de tickets.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 md:p-6 border-t border-gray-100 dark:border-reply-border-dark bg-reply-bg/50 dark:bg-reply-border-dark/30 flex flex-row justify-end gap-2 md:gap-3 backdrop-blur-sm">
          <button
            onClick={onClose}
            className="flex-1 md:flex-none px-4 md:px-6 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 rounded-xl text-xs md:text-sm font-bold transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className={`flex-[2] md:flex-none px-4 md:px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs md:text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 ${
              saving ? "opacity-70 cursor-wait active:scale-100" : ""
            }`}
          >
            {saving && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            )}
            {saving
              ? "Guardando..."
              : isEditing
                ? "Guardar Cambios"
                : "Crear Agente"}
          </button>
        </div>
      </div>
    </div>
  );
};


