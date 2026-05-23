import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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
} from "lucide-react";

interface Props {
  onSave?: () => void;
}

export const AIAgentConfig: React.FC<Props> = () => {
  const [activeTab, setActiveTab] = useState<
    "credentials" | "assistants" | "knowledge"
  >("assistants");
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  // Credentials State
  const [creds, setCreds] = useState({ openaiKey: "", geminiKey: "" });
  const [showKeys, setShowKeys] = useState(false);

  // Assistants State
  interface AIAssistantState {
    id?: string;
    name: string;
    modelProvider: string;
    modelName: string;
    systemPrompt: string;
    temperature: number;
    _count?: { queues?: number };
  }

  const [assistants, setAssistants] = useState<AIAssistantState[]>([]);
  const [isEditingAssistant, setIsEditingAssistant] = useState(false);
  const [currentAssistant, setCurrentAssistant] = useState<AIAssistantState>({
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
      toast.success(t("ai_config.credentials.success", "Credenciales actualizadas correctamente."));
    } catch (error) {
      toast.error(t("ai_config.credentials.error", "Error al guardar credenciales."));
    }
  };

  const handleSaveAssistant = async () => {
    if (!currentAssistant.name || !currentAssistant.systemPrompt)
      return toast.error(t("ai_config.assistants.err_required", "Nombre y Prompt son obligatorios"));

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
    } catch (error: unknown) {
      console.error(error);
      const msg =
        error instanceof Error ? error.message : t("ai_config.assistants.err_save", "Error al guardar asistente");
      toast.error(msg);
    }
  };

  const handleEditAssistant = (assistant: AIAssistantState) => {
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
    if (!confirm(t("ai_config.assistants.confirm_delete", "¿Estás seguro de eliminar este asistente?"))) return;
    try {
      await deleteAssistant(id);
      loadData();
    } catch (error: unknown) {
      console.error(error);
      const msg = error instanceof Error ? error.message : t("ai_config.assistants.err_delete", "Error al eliminar");
      toast.error(msg);
    }
  };

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark transition-colors duration-200">
      <ModuleHeader
        title={t("ai_config.title", "Gestión de Agentes IA")}
        description={t("ai_config.description", "Configura tus cerebros artificiales, credenciales y bases de conocimiento.")}
        icon={<BrainCircuit className="w-8 h-8 text-white relative z-10" />}
        gradient="from-reply-brand to-reply-brand-dark"
        stats={{
          label: t("ai_config.total_agents", "Total Agentes"),
          value: assistants.length,
        }}
      />

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* SIDEBAR NAVIGATION - ENTERPRISE STYLE */}
        <div className="w-full md:w-72 bg-white dark:bg-reply-panel-dark border-b md:border-b-0 md:border-r border-reply-border dark:border-reply-border-dark flex flex-col shrink-0 z-20 shadow-sm md:shadow-none sticky top-0 md:static">
          <div className="p-3 md:p-6">
            <h3 className="text-[10px] md:text-xs font-black text-reply-text-secondary/60 dark:text-reply-text-secondary-dark/60 uppercase tracking-widest mb-2 md:mb-4 px-2 hidden md:block">
              {t("ai_config.nav.config", "Configuración")}
            </h3>
            <nav className="flex md:flex-col overflow-x-auto md:overflow-x-visible no-scrollbar gap-2 md:gap-2 pb-2 md:pb-0 scroll-smooth px-1">
              <NavButton
                active={activeTab === "assistants"}
                onClick={() => setActiveTab("assistants")}
                icon={<Bot className="w-5 h-5 flex-shrink-0" />}
                label={t("ai_config.nav.assistants", "Asistentes")}
                description={t("ai_config.nav.assistants_desc", "Personalidad y Modelos")}
              />
              <NavButton
                active={activeTab === "credentials"}
                onClick={() => setActiveTab("credentials")}
                icon={<Key className="w-5 h-5 flex-shrink-0" />}
                label={t("ai_config.nav.credentials", "Credenciales")}
                description={t("ai_config.nav.credentials_desc", "OpenAI & Gemini Keys")}
              />
              <NavButton
                active={activeTab === "knowledge"}
                onClick={() => setActiveTab("knowledge")}
                icon={<Library className="w-5 h-5 flex-shrink-0" />}
                label={t("ai_config.nav.knowledge", "Conocimiento")}
                description={t("ai_config.nav.knowledge_desc", "Documentos y FAQs")}
              />
            </nav>
          </div>

          <div className="mt-auto p-6 hidden md:block">
            <div className="bg-gradient-to-br from-reply-brand/10 to-reply-brand-dark/10 rounded-2xl p-4 border border-reply-brand/10">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-reply-brand text-white flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-reply-brand dark:text-reply-brand-light">
                  {t("ai_config.tips.title", "AI Pro Tips")}
                </div>
              </div>
              <p className="text-[10px] text-reply-text-secondary dark:text-reply-text-secondary-dark/80 leading-relaxed font-semibold">
                {t("ai_config.tips.content", "Usa temperaturas bajas (0.2) para soporte técnico preciso, y altas (0.8) para marketing creativo.")}
              </p>
            </div>
          </div>
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50/20 dark:bg-transparent custom-scrollbar">
          <div className="max-w-5xl mx-auto pb-20 md:pb-0">
            {/* CREDENTIALS TAB */}
            {activeTab === "credentials" && (
              <div className="animate-fade-in space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-reply-text-primary dark:text-reply-text-primary-dark flex items-center gap-3">
                      <ShieldCheck className="w-8 h-8 text-reply-brand" />
                      {t("ai_config.credentials.title", "Proveedores de IA (BYOK)")}
                    </h2>
                    <p className="text-reply-text-secondary dark:text-reply-text-secondary-dark mt-1 max-w-2xl text-sm font-semibold">
                      {t("ai_config.credentials.desc", "Configura tus propias claves API para tener control total sobre límites y facturación directa con los proveedores.")}
                    </p>
                  </div>
                </div>

                <Card className="p-8 shadow-xl shadow-gray-200/20 dark:shadow-none">
                  <div className="grid gap-6">
                    <Input
                      id="openai-key"
                      label="OpenAI API Key"
                      type={showKeys ? "text" : "password"}
                      value={creds.openaiKey || ""}
                      onChange={(e) =>
                        setCreds({ ...creds, openaiKey: e.target.value })
                      }
                      placeholder="sk-..."
                      icon={<Cpu className="h-5 w-5 text-reply-text-secondary/60" />}
                    />

                    <Input
                      id="gemini-key"
                      label="Google Gemini API Key"
                      type={showKeys ? "text" : "password"}
                      value={creds.geminiKey || ""}
                      onChange={(e) =>
                        setCreds({ ...creds, geminiKey: e.target.value })
                      }
                      placeholder="AIza..."
                      icon={<Sparkles className="h-5 w-5 text-reply-text-secondary/60" />}
                    />
                  </div>

                  <div className="mt-6 flex items-center justify-between">
                    <button
                      onClick={() => setShowKeys(!showKeys)}
                      className="flex items-center gap-2 text-sm text-reply-text-secondary dark:text-reply-text-secondary-dark hover:text-reply-text-primary dark:hover:text-reply-text-primary-dark transition-colors font-bold cursor-pointer"
                    >
                      {showKeys ? (
                        <>
                          <EyeOff className="w-4 h-4" /> {t("ai_config.credentials.hide", "Ocultar Claves")}
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4" /> {t("ai_config.credentials.show", "Mostrar Claves")}
                        </>
                      )}
                    </button>

                    <Button
                      onClick={handleSaveCreds}
                      className="px-8 py-3"
                    >
                      <Save className="w-4 h-4" />
                      {t("ai_config.credentials.save", "Guardar Configuración")}
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* ASSISTANTS TAB */}
            {activeTab === "assistants" && (
              <div className="animate-fade-in space-y-6">
                {!isEditingAssistant ? (
                  <>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                      <div>
                        <h2 className="text-2xl font-bold text-reply-text-primary dark:text-reply-text-primary-dark flex items-center gap-2">
                          <Bot className="w-7 h-7 text-reply-brand" />
                          {t("ai_config.assistants.title", "Mis Asistentes")}
                        </h2>
                        <p className="text-reply-text-secondary dark:text-reply-text-secondary-dark text-sm mt-1 font-semibold">
                          {t("ai_config.assistants.desc", "Gestiona los roles y personalidades de tus agentes.")}
                        </p>
                      </div>
                      <Button
                        onClick={handleCreateNew}
                        className="px-6 py-3 shadow-xl"
                      >
                        <Plus className="w-4 h-4" /> {t("ai_config.assistants.new_button", "Nuevo Asistente")}
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {assistants.map((assistant) => (
                        <Card
                          key={assistant.id}
                          hoverable
                          className="p-6 relative group overflow-hidden flex flex-col justify-between"
                        >
                          <div className="absolute top-0 right-0 p-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleEditAssistant(assistant)}
                              className="p-2 min-w-fit rounded-lg shadow-sm bg-white dark:bg-reply-panel-dark"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                if (assistant.id)
                                  handleDeleteAssistant(assistant.id);
                              }}
                              className="p-2 min-w-fit hover:text-rose-500 hover:border-rose-500/30 rounded-lg shadow-sm bg-white dark:bg-reply-panel-dark"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>

                          <div>
                            <div className="flex items-center gap-4 mb-4">
                              <div
                                className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-inner ${
                                  assistant.modelProvider === "OPENAI"
                                    ? "bg-emerald-500/10 text-emerald-600"
                                    : "bg-reply-brand/10 text-reply-brand"
                                }`}
                              >
                                {assistant.modelProvider === "OPENAI" ? (
                                  <Bot className="w-7 h-7" />
                                ) : (
                                  <Sparkles className="w-7 h-7" />
                                )}
                              </div>
                              <div>
                                <h3 className="font-bold text-reply-text-primary dark:text-reply-text-primary-dark group-hover:text-reply-brand dark:group-hover:text-reply-brand-light transition-colors">
                                  {assistant.name}
                                </h3>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest bg-reply-bg dark:bg-white/5 text-reply-text-secondary dark:text-reply-text-secondary-dark mt-1 border border-reply-border/30 dark:border-reply-border-dark/30">
                                  {assistant.modelName}
                                </span>
                              </div>
                            </div>

                            <div className="bg-reply-bg/30 dark:bg-white/5 rounded-xl p-4 mb-4 border border-reply-border/20 dark:border-reply-border-dark/20 min-h-[90px] flex items-center">
                              <p className="text-xs text-reply-text-secondary dark:text-reply-text-secondary-dark line-clamp-3 font-semibold leading-relaxed">
                                {assistant.systemPrompt}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs font-semibold text-reply-text-secondary dark:text-reply-text-secondary-dark pt-2 border-t border-reply-border dark:border-reply-border-dark">
                            <div className="flex items-center gap-1 font-mono">
                              <Settings className="w-3.5 h-3.5" />
                              Temp: {assistant.temperature}
                            </div>
                            <div>
                              {assistant._count?.queues || 0} {t("ai_config.assistants.queues_assigned", "Colas Asignadas")}
                            </div>
                          </div>
                        </Card>
                      ))}

                      {assistants.length === 0 && (
                        <div className="col-span-full py-20 bg-white/50 dark:bg-white/5 rounded-[2rem] border border-dashed border-reply-border dark:border-reply-border-dark flex flex-col items-center justify-center text-center">
                          <div className="w-20 h-20 bg-reply-bg dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                            <Bot className="w-10 h-10 text-reply-text-secondary" />
                          </div>
                          <h3 className="text-lg font-bold text-reply-text-primary dark:text-reply-text-primary-dark mb-1">
                            {t("ai_config.assistants.empty_title", "Sin asistentes activos")}
                          </h3>
                          <p className="text-reply-text-secondary dark:text-reply-text-secondary-dark text-sm mb-6 max-w-sm font-semibold">
                            {t("ai_config.assistants.empty_desc", "Crea tu primer agente de IA para comenzar a automatizar conversaciones.")}
                          </p>
                          <button
                            onClick={handleCreateNew}
                            className="text-reply-brand font-black hover:underline cursor-pointer"
                          >
                            {t("ai_config.assistants.create_now", "Crear Asistente Ahora")}
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <Card className="p-8 max-w-4xl mx-auto shadow-2xl">
                    <div className="flex justify-between items-center mb-8 pb-6 border-b border-reply-border dark:border-reply-border-dark">
                      <h2 className="text-2xl font-bold text-reply-text-primary dark:text-reply-text-primary-dark">
                        {currentAssistant.id ? t("ai_config.assistants.edit_title", "Editar Agente") : t("ai_config.assistants.create_title", "Nuevo Agente")}
                      </h2>
                      <button
                        onClick={() => setIsEditingAssistant(false)}
                        className="text-reply-text-secondary hover:text-reply-text-primary dark:hover:text-white transition-colors font-bold cursor-pointer"
                      >
                        {t("common.cancel", "Cancelar")}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                      <div className="space-y-6">
                        <Input
                          id="assistant-identity"
                          label={t("ai_config.assistants.identity", "Identidad del Agente")}
                          type="text"
                          value={currentAssistant.name}
                          onChange={(e) =>
                            setCurrentAssistant({
                              ...currentAssistant,
                              name: e.target.value,
                            })
                          }
                          placeholder={t("ai_config.assistants.identity_placeholder", "Ej: Experto en Soporte L1")}
                        />

                        <div className="group flex flex-col gap-1.5 w-full">
                          <label className="text-xs font-black text-reply-text-secondary dark:text-reply-text-secondary-dark uppercase tracking-widest">
                            {t("ai_config.assistants.model", "Modelo de IA")}
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
                              className="w-full appearance-none bg-reply-bg/20 dark:bg-white/5 border border-reply-border dark:border-reply-border-dark rounded-xl px-4 py-3 text-sm font-medium focus:ring-4 focus:ring-reply-brand/10 focus:border-reply-brand transition-all outline-none cursor-pointer text-reply-text-primary dark:text-reply-text-primary-dark"
                            >
                              <optgroup label="🤖 OpenAI" className="bg-white dark:bg-reply-panel-dark text-reply-text-primary dark:text-reply-text-primary-dark">
                                <option value="OPENAI|gpt-4o" className="bg-white dark:bg-reply-panel-dark text-reply-text-primary dark:text-reply-text-primary-dark">GPT-4o (Alta capacidad - Recomendado)</option>
                                <option value="OPENAI|gpt-4o-mini" className="bg-white dark:bg-reply-panel-dark text-reply-text-primary dark:text-reply-text-primary-dark">GPT-4o Mini (Veloz y económico)</option>
                                <option value="OPENAI|gpt-4-turbo" className="bg-white dark:bg-reply-panel-dark text-reply-text-primary dark:text-reply-text-primary-dark">GPT-4 Turbo (Anterior)</option>
                              </optgroup>
                              <optgroup label="✨ Google Gemini" className="bg-white dark:bg-reply-panel-dark text-reply-text-primary dark:text-reply-text-primary-dark">
                                <option value="GEMINI|gemini-2.5-flash" className="bg-white dark:bg-reply-panel-dark text-reply-text-primary dark:text-reply-text-primary-dark">Gemini 2.5 Flash (Recomendado - Veloz y económico)</option>
                                <option value="GEMINI|gemini-2.5-pro" className="bg-white dark:bg-reply-panel-dark text-reply-text-primary dark:text-reply-text-primary-dark">Gemini 2.5 Pro (Razonamiento complejo y análisis avanzado)</option>
                                <option value="GEMINI|gemini-1.5-flash" className="bg-white dark:bg-reply-panel-dark text-reply-text-primary dark:text-reply-text-primary-dark">Gemini 1.5 Flash (Estable - Versión anterior)</option>
                                <option value="GEMINI|gemini-1.5-pro" className="bg-white dark:bg-reply-panel-dark text-reply-text-primary dark:text-reply-text-primary-dark">Gemini 1.5 Pro (Estable - Ventana de contexto gigante)</option>
                              </optgroup>
                            </select>
                            <ChevronRight className="w-5 h-5 absolute right-4 top-1/2 transform -translate-y-1/2 rotate-90 text-reply-text-secondary/60 pointer-events-none" />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between mb-3">
                            <label className="text-xs font-black text-reply-text-secondary dark:text-reply-text-secondary-dark uppercase tracking-widest">
                              {t("ai_config.assistants.creativity", "Creatividad")}
                            </label>
                            <span className="text-xs font-bold text-reply-brand bg-reply-brand/10 px-2 py-0.5 rounded">
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
                            className="w-full accent-reply-brand h-2 bg-reply-bg dark:bg-reply-border-dark rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-[10px] text-reply-text-secondary/60 dark:text-reply-text-secondary-dark/60 font-black uppercase mt-2">
                            <span>{t("ai_config.assistants.precise", "Preciso")}</span>
                            <span>{t("ai_config.assistants.creative", "Creativo")}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col h-full gap-1.5">
                        <label className="block text-xs font-black text-reply-text-secondary dark:text-reply-text-secondary-dark uppercase tracking-widest">
                          {t("ai_config.assistants.system_prompt", "System Prompt (Instrucciones)")}
                        </label>
                        <textarea
                          value={currentAssistant.systemPrompt}
                          onChange={(e) =>
                            setCurrentAssistant({
                              ...currentAssistant,
                              systemPrompt: e.target.value,
                            })
                          }
                          placeholder={t("ai_config.assistants.prompt_placeholder", "Define la personalidad, tono y reglas del asistente...")}
                          className="flex-1 w-full bg-reply-bg/20 dark:bg-white/5 border border-reply-border dark:border-reply-border-dark rounded-xl px-4 py-4 text-sm font-medium focus:ring-4 focus:ring-reply-brand/10 focus:border-reply-brand transition-all outline-none resize-none font-mono leading-relaxed text-reply-text-primary dark:text-reply-text-primary-dark"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-4 pt-6 border-t border-reply-border dark:border-reply-border-dark">
                      <Button
                        variant="ghost"
                        onClick={() => setIsEditingAssistant(false)}
                      >
                        {t("common.cancel", "Cancelar")}
                      </Button>
                      <Button
                        onClick={handleSaveAssistant}
                        className="px-8 py-3"
                      >
                        <Save className="w-4 h-4" />
                        {t("ai_config.assistants.save_button", "Guardar Agente")}
                      </Button>
                    </div>
                  </Card>
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

// Sub-componente NavButton con estilo Enterprise y marca reply
const NavButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  description?: string;
}> = ({ active, onClick, icon, label, description }) => (
  <button
    onClick={onClick}
    className={`w-auto md:w-full min-w-fit md:min-w-0 text-left px-3 md:px-4 py-2 md:py-3 rounded-xl transition-all duration-200 group relative overflow-hidden flex-shrink-0 cursor-pointer ${
      active
        ? "bg-reply-brand/10 border border-reply-brand/20"
        : "hover:bg-reply-bg dark:hover:bg-reply-bg-dark border border-transparent"
    }`}
  >
    {active && (
      <div className="hidden md:block absolute left-0 top-0 bottom-0 w-1 bg-reply-brand rounded-l-xl" />
    )}
    <div className="flex items-center gap-2 md:gap-3 relative z-10">
      <div
        className={`p-1.5 md:p-2 rounded-lg transition-colors ${
          active
            ? "bg-reply-brand text-white shadow-lg shadow-reply-brand/30"
            : "bg-reply-bg dark:bg-reply-panel-dark text-reply-text-secondary group-hover:text-reply-brand group-hover:bg-reply-brand/10 dark:group-hover:bg-reply-brand/20"
        }`}
      >
        {icon}
      </div>
      <div>
        <div
          className={`text-xs md:text-sm font-bold whitespace-nowrap ${
            active
              ? "text-reply-text-primary dark:text-reply-text-primary-dark"
              : "text-reply-text-secondary dark:text-reply-text-secondary-dark group-hover:text-reply-text-primary dark:group-hover:text-reply-text-primary-dark"
          }`}
        >
          {label}
        </div>
        {description && (
          <div className="hidden md:block text-[10px] text-reply-text-secondary/60 dark:text-reply-text-secondary-dark/60 font-semibold truncate max-w-[140px]">
            {description}
          </div>
        )}
      </div>
    </div>
  </button>
);
