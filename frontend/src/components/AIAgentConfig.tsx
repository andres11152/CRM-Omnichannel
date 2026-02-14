import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { ModuleHeader } from "./common/ModuleHeader";
import {
  getAIConfig,
  updateAIConfig,
  getAssistants,
  createAssistant,
  deleteAssistant,
  updateAssistant,
} from "@/services/aiService";
import { KnowledgeBase } from "./KnowledgeBase";
import {
  Bot,
  Key,
  Library,
  Plus,
  Edit2,
  Trash2,
  Sparkles,
  BrainCircuit,
  Settings,
  Cpu,
  Save,
  ShieldCheck,
  Eye,
  EyeOff,
  ChevronRight,
  Search,
} from "lucide-react";

interface Props {
  onSave?: () => void;
}

export const AIAgentConfig: React.FC<Props> = () => {
  const [activeTab, setActiveTab] = useState<
    "credentials" | "assistants" | "knowledge"
  >("assistants");
  const [loading, setLoading] = useState(false);

  // Credentials State
  const [creds, setCreds] = useState({ openaiKey: "", geminiKey: "" });
  const [showKeys, setShowKeys] = useState(false);

  // Assistants State
  const [assistants, setAssistants] = useState<any[]>([]);
  const [isEditingAssistant, setIsEditingAssistant] = useState(false);
  const [currentAssistant, setCurrentAssistant] = useState<any>({
    name: "",
    modelProvider: "OPENAI",
    modelName: "gpt-4o",
    systemPrompt: "",
    temperature: 0.7,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [configData, assistantsData] = await Promise.all([
        getAIConfig(),
        getAssistants(),
      ]);
      setCreds({
        openaiKey: configData.openaiKey || "",
        geminiKey: configData.geminiKey || "",
      });
      setAssistants(assistantsData);
    } catch (error) {
      console.error("Error loading AI data", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCreds = async () => {
    try {
      await updateAIConfig(creds);
      toast.success("Credenciales actualizadas correctamente.");
    } catch (error) {
      toast.error("Error al guardar credenciales.");
    }
  };

  const handleSaveAssistant = async () => {
    if (!currentAssistant.name || !currentAssistant.systemPrompt)
      return toast.error("Nombre y Prompt son obligatorios");

    try {
      if (currentAssistant.id) {
        await updateAssistant(currentAssistant.id, currentAssistant);
      } else {
        await createAssistant(currentAssistant);
      }
      setIsEditingAssistant(false);
      setCurrentAssistant({
        name: "",
        modelProvider: "OPENAI",
        modelName: "gpt-4o",
        systemPrompt: "",
        temperature: 0.7,
      });
      loadData(); // Refresh list
    } catch (error: any) {
      console.error(error);
      toast.error(
        error.response?.data?.message || "Error al guardar asistente",
      );
    }
  };

  const handleEditAssistant = (assistant: any) => {
    setCurrentAssistant({
      id: assistant.id,
      name: assistant.name,
      modelProvider: assistant.modelProvider,
      modelName: assistant.modelName,
      systemPrompt: assistant.systemPrompt,
      temperature: assistant.temperature,
    });
    setIsEditingAssistant(true);
  };

  const handleCreateNew = () => {
    setCurrentAssistant({
      name: "",
      modelProvider: "OPENAI",
      modelName: "gpt-4o",
      systemPrompt: "",
      temperature: 0.7,
    });
    setIsEditingAssistant(true);
  };

  const handleDeleteAssistant = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este asistente?")) return;
    try {
      await deleteAssistant(id);
      loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "Error al eliminar");
    }
  };

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark transition-colors duration-200">
      <ModuleHeader
        title="Gestión de Agentes IA"
        description="Configura tus cerebros artificiales, credenciales y bases de conocimiento."
        icon={<BrainCircuit className="w-8 h-8 text-white relative z-10" />}
        gradient="from-violet-600 to-indigo-600 dark:from-violet-800 dark:to-indigo-900"
        stats={{
          label: "Total Agentes",
          value: assistants.length,
        }}
      />

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* SIDEBAR NAVIGATION - ENTERPRISE STYLE */}
        <div className="w-full md:w-72 bg-white dark:bg-reply-panel-dark border-b md:border-b-0 md:border-r border-gray-100 dark:border-reply-border-dark flex flex-col shrink-0 z-20 shadow-sm md:shadow-none sticky top-0 md:static">
          <div className="p-3 md:p-6">
            <h3 className="text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-widest mb-2 md:mb-4 px-2 hidden md:block">
              Configuración
            </h3>
            <nav className="flex md:flex-col overflow-x-auto md:overflow-x-visible no-scrollbar gap-2 md:gap-2 pb-2 md:pb-0 scroll-smooth px-1">
              <NavButton
                active={activeTab === "assistants"}
                onClick={() => setActiveTab("assistants")}
                icon={<Bot className="w-5 h-5 flex-shrink-0" />}
                label="Asistentes"
                description="Personalidad y Modelos"
              />
              <NavButton
                active={activeTab === "credentials"}
                onClick={() => setActiveTab("credentials")}
                icon={<Key className="w-5 h-5 flex-shrink-0" />}
                label="Credenciales"
                description="OpenAI & Gemini Keys"
              />
              <NavButton
                active={activeTab === "knowledge"}
                onClick={() => setActiveTab("knowledge")}
                icon={<Library className="w-5 h-5 flex-shrink-0" />}
                label="Conocimiento"
                description="Documentos y FAQs"
              />
            </nav>
          </div>

          <div className="mt-auto p-6 hidden md:block">
            <div className="bg-gradient-to-br from-violet-500/10 to-indigo-500/10 rounded-2xl p-4 border border-violet-500/10">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-violet-500 text-white flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-violet-700 dark:text-violet-300">
                  AI Pro Tips
                </div>
              </div>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                Usa temperaturas bajas (0.2) para soporte técnico preciso, y
                altas (0.8) para marketing creativo.
              </p>
            </div>
          </div>
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50/50 dark:bg-transparent custom-scrollbar">
          <div className="max-w-5xl mx-auto pb-20 md:pb-0">
            {/* CREDENTIALS TAB */}
            {activeTab === "credentials" && (
              <div className="animate-fade-in space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                      <ShieldCheck className="w-8 h-8 text-emerald-500" />
                      Proveedores de IA (BYOK)
                    </h2>
                    <p className="text-gray-500 mt-1 max-w-2xl">
                      Configura tus propias claves API para tener control total
                      sobre límites y facturación directa con los proveedores.
                    </p>
                  </div>
                </div>

                <div className="bg-white dark:bg-reply-panel-dark p-8 rounded-[2rem] border border-gray-100 dark:border-reply-border-dark shadow-xl shadow-gray-200/50 dark:shadow-none">
                  <div className="grid gap-6">
                    <div className="group">
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3 group-focus-within:text-violet-500 transition-colors">
                        OpenAI API Key
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Cpu className="h-5 w-5 text-gray-400 group-focus-within:text-violet-500 transition-colors" />
                        </div>
                        <input
                          type={showKeys ? "text" : "password"}
                          value={creds.openaiKey || ""}
                          onChange={(e) =>
                            setCreds({ ...creds, openaiKey: e.target.value })
                          }
                          placeholder="sk-..."
                          className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl pl-12 pr-4 py-4 text-sm font-medium focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 transition-all outline-none"
                        />
                      </div>
                    </div>

                    <div className="group">
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3 group-focus-within:text-blue-500 transition-colors">
                        Google Gemini API Key
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Sparkles className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                        </div>
                        <input
                          type={showKeys ? "text" : "password"}
                          value={creds.geminiKey || ""}
                          onChange={(e) =>
                            setCreds({ ...creds, geminiKey: e.target.value })
                          }
                          placeholder="AIza..."
                          className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl pl-12 pr-4 py-4 text-sm font-medium focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-between">
                    <button
                      onClick={() => setShowKeys(!showKeys)}
                      className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors font-medium"
                    >
                      {showKeys ? (
                        <>
                          <EyeOff className="w-4 h-4" /> Ocultar Claves
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4" /> Mostrar Claves
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleSaveCreds}
                      className="px-8 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-violet-600/20 active:scale-95 transition-all flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Guardar Configuración
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ASSISTANTS TAB */}
            {activeTab === "assistants" && (
              <div className="animate-fade-in space-y-6">
                {!isEditingAssistant ? (
                  <>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                          <Bot className="w-7 h-7 text-violet-500" />
                          Mis Asistentes
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                          Gestiona los roles y personalidades de tus agentes.
                        </p>
                      </div>
                      <button
                        onClick={handleCreateNew}
                        className="px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-black rounded-xl font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" /> Nuevo Asistente
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {assistants.map((assistant) => (
                        <div
                          key={assistant.id}
                          className="group bg-white dark:bg-reply-panel-dark rounded-[1.5rem] p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-gray-100 dark:border-reply-border-dark relative overflow-hidden"
                        >
                          <div className="absolute top-0 right-0 p-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            <button
                              onClick={() => handleEditAssistant(assistant)}
                              className="p-2 bg-white dark:bg-gray-800 text-gray-400 hover:text-blue-500 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() =>
                                handleDeleteAssistant(assistant.id)
                              }
                              className="p-2 bg-white dark:bg-gray-800 text-gray-400 hover:text-red-500 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="flex items-center gap-4 mb-4">
                            <div
                              className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-inner ${
                                assistant.modelProvider === "OPENAI"
                                  ? "bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600"
                                  : "bg-blue-50 dark:bg-blue-900/10 text-blue-600"
                              }`}
                            >
                              {assistant.modelProvider === "OPENAI" ? (
                                <Bot className="w-7 h-7" />
                              ) : (
                                <Sparkles className="w-7 h-7" />
                              )}
                            </div>
                            <div>
                              <h3 className="font-bold text-gray-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                                {assistant.name}
                              </h3>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest bg-gray-100 dark:bg-gray-800 text-gray-500 mt-1">
                                {assistant.modelName}
                              </span>
                            </div>
                          </div>

                          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 mb-4 border border-gray-100 dark:border-gray-700/50">
                            <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-3 font-medium leading-relaxed">
                              {assistant.systemPrompt}
                            </p>
                          </div>

                          <div className="flex items-center justify-between text-xs font-medium text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-800">
                            <div className="flex items-center gap-1">
                              <Settings className="w-3 h-3" />
                              Temp: {assistant.temperature}
                            </div>
                            <div>
                              {assistant._count?.queues || 0} Colas Asignadas
                            </div>
                          </div>
                        </div>
                      ))}

                      {assistants.length === 0 && (
                        <div className="col-span-full py-20 bg-white/50 dark:bg-white/5 rounded-[2rem] border border-dashed border-gray-300 dark:border-gray-700 flex flex-col items-center justify-center text-center">
                          <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                            <Bot className="w-10 h-10 text-gray-400" />
                          </div>
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                            Sin asistentes activos
                          </h3>
                          <p className="text-gray-500 text-sm mb-6 max-w-sm">
                            Crea tu primer agente de IA para comenzar a
                            automatizar conversaciones.
                          </p>
                          <button
                            onClick={handleCreateNew}
                            className="text-violet-600 font-bold hover:underline"
                          >
                            Crear Asistente Ahora
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="bg-white dark:bg-reply-panel-dark p-8 rounded-[2rem] border border-gray-100 dark:border-reply-border-dark shadow-2xl shadow-gray-200/50 dark:shadow-none max-w-4xl mx-auto">
                    <div className="flex justify-between items-center mb-8 pb-6 border-b border-gray-100 dark:border-reply-border-dark">
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {currentAssistant.id ? "Editar Agente" : "Nuevo Agente"}
                      </h2>
                      <button
                        onClick={() => setIsEditingAssistant(false)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                      <div className="space-y-6">
                        <div className="group">
                          <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
                            Identidad del Agente
                          </label>
                          <input
                            type="text"
                            value={currentAssistant.name}
                            onChange={(e) =>
                              setCurrentAssistant({
                                ...currentAssistant,
                                name: e.target.value,
                              })
                            }
                            placeholder="Ej: Experto en Soporte L1"
                            className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3.5 text-sm font-medium focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 transition-all outline-none"
                          />
                        </div>

                        <div className="group">
                          <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
                            Modelo de IA
                          </label>
                          <div className="relative">
                            <select
                              value={
                                currentAssistant.modelProvider +
                                "|" +
                                currentAssistant.modelName
                              }
                              onChange={(e) => {
                                const [provider, name] =
                                  e.target.value.split("|");
                                setCurrentAssistant({
                                  ...currentAssistant,
                                  modelProvider: provider,
                                  modelName: name,
                                });
                              }}
                              className="w-full appearance-none bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3.5 text-sm font-medium focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 transition-all outline-none cursor-pointer"
                            >
                              <optgroup label="🟢 OpenAI">
                                <option value="OPENAI|gpt-4o">GPT-4o</option>
                                <option value="OPENAI|gpt-4-turbo">
                                  GPT-4 Turbo
                                </option>
                                <option value="OPENAI|gpt-3.5-turbo">
                                  GPT-3.5 Turbo
                                </option>
                              </optgroup>
                              <optgroup label="✨ Google Gemini">
                                <option value="GEMINI|gemini-2.5-flash">
                                  Gemini 2.5 Flash (Recomendado)
                                </option>
                                <option value="GEMINI|gemini-1.5-pro">
                                  Gemini 1.5 Pro
                                </option>
                              </optgroup>
                            </select>
                            <ChevronRight className="w-5 h-5 absolute right-4 top-1/2 transform -translate-y-1/2 rotate-90 text-gray-400 pointer-events-none" />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between mb-3">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">
                              Creatividad
                            </label>
                            <span className="text-xs font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded">
                              {currentAssistant.temperature}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={currentAssistant.temperature}
                            onChange={(e) =>
                              setCurrentAssistant({
                                ...currentAssistant,
                                temperature: parseFloat(e.target.value),
                              })
                            }
                            className="w-full accent-violet-600 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase mt-2">
                            <span>Preciso</span>
                            <span>Creativo</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col h-full">
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
                          System Prompt (Instrucciones)
                        </label>
                        <textarea
                          value={currentAssistant.systemPrompt}
                          onChange={(e) =>
                            setCurrentAssistant({
                              ...currentAssistant,
                              systemPrompt: e.target.value,
                            })
                          }
                          placeholder="Define la personalidad, tono y reglas del asistente..."
                          className="flex-1 w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-4 text-sm font-medium focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 transition-all outline-none resize-none font-mono leading-relaxed"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-4 pt-6 border-t border-gray-100 dark:border-gray-800">
                      <button
                        onClick={() => setIsEditingAssistant(false)}
                        className="px-6 py-3 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl font-bold text-sm transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSaveAssistant}
                        className="px-8 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-violet-600/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                      >
                        <Save className="w-4 h-4" />
                        Guardar Agente
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* KNOWLEDGE BASE TAB */}
            {activeTab === "knowledge" && (
              <div className="animate-fade-in h-[calc(100vh-250px)]">
                <KnowledgeBase />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Sub-componente NavButton con estilo Enterprise
const NavButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  description?: string;
}> = ({ active, onClick, icon, label, description }) => (
  <button
    onClick={onClick}
    className={`w-auto md:w-full min-w-fit md:min-w-0 text-left px-3 md:px-4 py-2 md:py-3 rounded-xl transition-all duration-200 group relative overflow-hidden flex-shrink-0 ${
      active
        ? "bg-violet-50 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-500/20"
        : "hover:bg-gray-50 dark:hover:bg-gray-800/50 border border-transparent"
    }`}
  >
    {active && (
      <div className="hidden md:block absolute left-0 top-0 bottom-0 w-1 bg-violet-500 rounded-l-xl" />
    )}
    <div className="flex items-center gap-2 md:gap-3 relative z-10">
      <div
        className={`p-1.5 md:p-2 rounded-lg transition-colors ${
          active
            ? "bg-violet-500 text-white shadow-lg shadow-violet-500/30"
            : "bg-gray-100 dark:bg-gray-800 text-gray-500 group-hover:text-violet-500 group-hover:bg-violet-50 dark:group-hover:bg-violet-900/20"
        }`}
      >
        {icon}
      </div>
      <div>
        <div
          className={`text-xs md:text-sm font-bold whitespace-nowrap ${
            active
              ? "text-gray-900 dark:text-white"
              : "text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200"
          }`}
        >
          {label}
        </div>
        {description && (
          <div className="hidden md:block text-[10px] text-gray-400 font-medium truncate max-w-[140px]">
            {description}
          </div>
        )}
      </div>
    </div>
  </button>
);
