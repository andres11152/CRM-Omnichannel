import React from "react";
import { 
  X, 
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
  Trash2
} from "lucide-react";

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
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center z-[100] p-0 sm:p-4 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-reply-panel-dark rounded-t-3xl sm:rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden border border-gray-100 dark:border-reply-border-dark transform transition-all flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-50 dark:border-reply-border-dark flex justify-between items-center bg-[#FBFCFE] dark:bg-reply-surface-dark">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl ${isEditing ? 'bg-indigo-500 text-white' : 'bg-emerald-500 text-white'} shadow-lg`}>
              {isEditing ? <Settings2 size={24} /> : <UserPlus size={24} />}
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">
                {isEditing ? "Editar Agente" : "Nuevo Agente"}
              </h3>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">
                {isEditing ? "Configuración de perfil" : "Registro de nuevo miembro"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl"
          >
            <X size={24} />
          </button>
        </div>

        {/* Form Content */}
        <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* LEFT COLUMN: Identity & Access */}
            <div className="space-y-8">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em]">Paso 1</span>
                <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">Perfil & Acceso</h4>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                  <User size={12} /> Nombre Completo
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => onFormChange("name", e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-4 text-sm font-bold text-gray-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                  placeholder="Ej: Juan Pérez"
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                  <Mail size={12} /> Email Corporativo
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => onFormChange("email", e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-4 text-sm font-bold text-gray-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                  placeholder="juan@reply.com"
                />
              </div>

              {/* Password */}
              {!isEditing && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                    <Lock size={12} /> Contraseña de Acceso
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => onFormChange("password", e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-4 text-sm font-bold text-gray-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                    placeholder="••••••••"
                  />
                  <p className="text-[9px] font-bold text-gray-400 mt-2 px-1">Mínimo 8 caracteres, números y símbolos.</p>
                </div>
              )}

              {/* Role */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                  <Shield size={12} /> Rol de Sistema
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => onFormChange("role", e.target.value)}
                  disabled={currentUser?.role === "SUPERVISOR"}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-4 text-sm font-bold text-gray-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none appearance-none"
                >
                  <option value="AGENT">Agente (Operador)</option>
                  {currentUser?.role !== "SUPERVISOR" && (
                    <>
                      <option value="SUPERVISOR">Supervisor</option>
                      <option value="ADMIN">Administrador</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* RIGHT COLUMN: Operation & Config */}
            <div className="space-y-8">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em]">Paso 2</span>
                <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">Operación & Skills</h4>
              </div>

              {/* Department */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                  <Building size={12} /> Departamento / Fila
                </label>
                <select
                  value={formData.department}
                  onChange={(e) => onFormChange("department", e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-4 text-sm font-bold text-gray-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none appearance-none"
                >
                  {departments.length === 0 ? (
                    <option value="">Sin departamentos disponibles</option>
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
                      <Zap size={12} /> Chats Simultáneos
                    </label>
                    <p className="text-[9px] text-gray-400 font-bold uppercase">Capacidad de respuesta</p>
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
                  <span>Carga Baja</span>
                  <span>Carga Crítica</span>
                </div>
              </div>

              {/* Skills Tags */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                  <Plus size={12} /> Habilidades (Skills)
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
                    placeholder="Nueva habilidad..."
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-gray-50 dark:border-reply-border-dark bg-[#FBFCFE] dark:bg-reply-surface-dark flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-gray-900 dark:hover:text-white transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="group px-10 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[1.25rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-wait"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save size={16} className="group-hover:scale-110 transition-transform" />
            )}
            {saving ? "Procesando..." : isEditing ? "Guardar Cambios" : "Finalizar Registro"}
          </button>
        </div>
      </div>
    </div>
  );
};
