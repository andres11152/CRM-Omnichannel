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
} from "../services/aiService";
import { KnowledgeBase } from "./KnowledgeBase";

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
      await deleteAssistant(id);
      loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "Error al eliminar");
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-[#0b141a]">
      <ModuleHeader
        title="Gestión de Agentes IA"
        description="Configura tus cerebros artificiales, credenciales y bases de conocimiento."
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
              d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
            />
          </svg>
        }
        gradient="from-emerald-600 to-teal-600 dark:from-emerald-800 dark:to-teal-800"
      />

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* 📱 MOBILE TABS / 🖥️ DESKTOP SIDEBAR */}
        <div className="md:w-64 bg-white dark:bg-[#202c33] border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700 flex flex-col shrink-0">
          <nav className="p-2 md:p-4 flex md:flex-col overflow-x-auto md:overflow-x-visible no-scrollbar space-x-1 md:space-x-0 md:space-y-2">
            <NavButton
              active={activeTab === "assistants"}
              onClick={() => setActiveTab("assistants")}
              icon="🤖"
              label="Asistentes"
              fullLabel="Asistentes (Personas)"
            />
            <NavButton
              active={activeTab === "credentials"}
              onClick={() => setActiveTab("credentials")}
              icon="🔑"
              label="Credenciales"
              fullLabel="Credenciales API"
            />
            <NavButton
              active={activeTab === "knowledge"}
              onClick={() => setActiveTab("knowledge")}
              icon="📚"
              label="Conocimiento"
              fullLabel="Base de Conocimiento"
            />
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {/* CREDENTIALS TAB */}
          {activeTab === "credentials" && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="bg-white dark:bg-[#202c33] p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
                  Configuración de Proveedores (BYOK)
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  Ingresa tus propias API Keys para tener control total sobre el
                  consumo y los límites.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      OpenAI API Key
                    </label>
                    <div className="flex gap-2">
                      <input
                        type={showKeys ? "text" : "password"}
                        value={creds.openaiKey || ""}
                        onChange={(e) =>
                          setCreds({ ...creds, openaiKey: e.target.value })
                        }
                        placeholder="sk-..."
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-[#2a3942] text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Google Gemini API Key
                    </label>
                    <div className="flex gap-2">
                      <input
                        type={showKeys ? "text" : "password"}
                        value={creds.geminiKey || ""}
                        onChange={(e) =>
                          setCreds({ ...creds, geminiKey: e.target.value })
                        }
                        placeholder="AIza..."
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-[#2a3942] text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      id="showKeys"
                      checked={showKeys}
                      onChange={(e) => setShowKeys(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <label
                      htmlFor="showKeys"
                      className="text-sm text-gray-600 dark:text-gray-400"
                    >
                      Mostrar caracteres
                    </label>
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleSaveCreds}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition-colors"
                  >
                    Guardar Credenciales
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ASSISTANTS TAB */}
          {activeTab === "assistants" && (
            <div className="space-y-6">
              {!isEditingAssistant ? (
                <>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <h2 className="text-xl md:text-2xl font-bold text-gray-800 dark:text-white">
                      Mis Asistentes
                    </h2>
                    <button
                      onClick={handleCreateNew}
                      className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                    >
                      <span>+</span> Nuevo Asistente
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {assistants.map((assistant) => (
                      <div
                        key={assistant.id}
                        className="bg-white dark:bg-[#202c33] p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow group relative"
                      >
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                          <button
                            onClick={() => handleEditAssistant(assistant)}
                            className="text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 p-1 rounded"
                            title="Editar"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteAssistant(assistant.id)}
                            className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded"
                            title="Eliminar"
                          >
                            🗑️
                          </button>
                        </div>
                        <div className="flex items-center gap-3 mb-4">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${assistant.modelProvider === "OPENAI" ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"}`}
                          >
                            {assistant.modelProvider === "OPENAI" ? "🤖" : "✨"}
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-800 dark:text-white">
                              {assistant.name}
                            </h3>
                            <p className="text-xs text-gray-500">
                              {assistant.modelName}
                            </p>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 mb-4 bg-gray-50 dark:bg-[#111b21] p-3 rounded-lg font-mono">
                          {assistant.systemPrompt}
                        </p>
                        <div className="flex items-center justify-between text-xs text-gray-400">
                          <span>Temp: {assistant.temperature}</span>
                          <span>
                            {assistant._count?.queues || 0} Colas asignadas
                          </span>
                        </div>
                      </div>
                    ))}
                    {assistants.length === 0 && (
                      <div className="col-span-full text-center py-12 text-gray-400 bg-gray-100 dark:bg-[#111b21] rounded-xl border-dashed border-2 border-gray-300 dark:border-gray-700">
                        <p>No tienes asistentes creados aún.</p>
                        <button
                          onClick={handleCreateNew}
                          className="mt-2 text-emerald-600 font-bold hover:underline"
                        >
                          Crear el primero
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="max-w-4xl mx-auto bg-white dark:bg-[#202c33] p-4 md:p-8 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                      Configurar Nuevo Asistente
                    </h2>
                    <button
                      onClick={() => setIsEditingAssistant(false)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                        Nombre del Asistente
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
                        placeholder="Ej: Experto en Ventas B2B"
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#2a3942] text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                        Modelo
                      </label>
                      <select
                        value={
                          currentAssistant.modelProvider +
                          "|" +
                          currentAssistant.modelName
                        }
                        onChange={(e) => {
                          const [provider, name] = e.target.value.split("|");
                          setCurrentAssistant({
                            ...currentAssistant,
                            modelProvider: provider,
                            modelName: name,
                          });
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#2a3942] text-gray-900 dark:text-white"
                      >
                        <optgroup label="🟢 OpenAI (Requiere Pago)">
                          <option value="OPENAI|gpt-4o">
                            GPT-4o (Recomendado para tareas complejas)
                          </option>
                          <option value="OPENAI|gpt-4-turbo">
                            GPT-4 Turbo (Versión rápida de GPT-4)
                          </option>
                          <option value="OPENAI|gpt-3.5-turbo">
                            GPT-3.5 Turbo (Rápido y económico)
                          </option>
                        </optgroup>
                        <optgroup label="🆓 Google Gemini (GRATIS)">
                          <option value="GEMINI|gemini-2.5-flash">
                            Gemini 2.5 Flash (⭐ Recomendado - Gratis)
                          </option>
                          <option value="GEMINI|gemini-2.5-flash-preview-09-2025">
                            Gemini 2.5 Flash Preview (Experimental - Gratis)
                          </option>
                        </optgroup>
                        <optgroup label="💳 Google Gemini (Requiere Pago)">
                          <option value="GEMINI|gemini-1.5-pro">
                            Gemini 1.5 Pro (Requiere configuración de pago)
                          </option>
                        </optgroup>
                      </select>
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                      Personalidad y Prompt del Sistema
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      Define cómo debe comportarse el asistente, qué tono usar y
                      qué reglas seguir.
                    </p>
                    <textarea
                      value={currentAssistant.systemPrompt}
                      onChange={(e) =>
                        setCurrentAssistant({
                          ...currentAssistant,
                          systemPrompt: e.target.value,
                        })
                      }
                      placeholder="Eres un asistente útil y amable..."
                      className="w-full h-48 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#2a3942] text-gray-900 dark:text-white font-mono text-sm"
                    />
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                      Creatividad (Temperatura): {currentAssistant.temperature}
                    </label>
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
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Preciso (0.0)</span>
                      <span>Balanceado (0.7)</span>
                      <span>Creativo (1.0)</span>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={() => setIsEditingAssistant(false)}
                      className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveAssistant}
                      className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold"
                    >
                      Guardar Asistente
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* KNOWLEDGE BASE TAB */}
          {activeTab === "knowledge" && (
            <div className="h-full">
              <KnowledgeBase />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const NavButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  fullLabel?: string;
}> = ({ active, onClick, icon, label, fullLabel }) => (
  <button
    onClick={onClick}
    className={`flex-1 md:w-full flex items-center justify-center md:justify-start gap-2 md:gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-lg transition-all whitespace-nowrap ${
      active
        ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-100 dark:border-emerald-800/50"
        : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent"
    }`}
  >
    <span className="text-lg md:text-xl">{icon}</span>
    <span className="text-xs md:text-sm hidden sm:inline md:hidden">
      {label}
    </span>
    <span className="text-xs md:text-sm inline sm:hidden md:inline">
      {fullLabel || label}
    </span>
  </button>
);
