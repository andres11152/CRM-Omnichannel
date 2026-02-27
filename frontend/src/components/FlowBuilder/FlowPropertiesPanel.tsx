import React, { useState, useEffect } from "react";
import { FlowNode } from "@/types";
import { API_BASE_URL } from "@/services/apiConfig";
import { MediaSelectorModal } from "./MediaSelectorModal";

import { getAgents, getQueues } from "@/services/queueService";

interface FlowPropertiesPanelProps {
  node: FlowNode;
  onUpdate: (key: string, value: any) => void;
  onDelete: () => void;
}

export const FlowPropertiesPanel: React.FC<FlowPropertiesPanelProps> = ({
  node,
  onUpdate,
  onDelete,
}) => {
  const [aiAgents, setAiAgents] = useState<any[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  // 🛡️ ROUTING DATA STATE (Agents & Queues)
  const [humanAgents, setHumanAgents] = useState<any[]>([]);
  const [supportQueues, setSupportQueues] = useState<any[]>([]);
  const [loadingRouting, setLoadingRouting] = useState(false);

  // Media Selector Modal
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [mediaModalType, setMediaModalType] = useState<
    "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT"
  >("IMAGE");

  const [fetchError, setFetchError] = useState(false);

  // Fetch AI Agents cuando el nodo es de tipo ai_agent
  useEffect(() => {
    if (node.type === "ai_agent") {
      fetchAIAgents();
    }
  }, [node.type]);

  const fetchAIAgents = async () => {
    setLoadingAgents(true);
    setFetchError(false);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/ai/assistants`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to fetch agents");

      const data = await response.json();
      // Backend returns direct array [{}, {}] but code expected { data: { agents: [] } }
      // This fix handles both cases robustly
      const agentsList = Array.isArray(data)
        ? data
        : data.data?.agents || data.agents || [];
      setAiAgents(agentsList);
    } catch (error) {
      console.error("[FlowProperties] Error fetching AI agents:", error);
      setAiAgents([]);
      setFetchError(true);
    } finally {
      setLoadingAgents(false);
    }
  };

  // 🛡️ FETCH ROUTING DATA (Humans & Queues)
  useEffect(() => {
    if (node.type === "assign_agent") {
      fetchRoutingData();
    }
  }, [node.type]);

  const fetchRoutingData = async () => {
    setLoadingRouting(true);
    try {
      const [agentsData, queuesData] = await Promise.all([
        getAgents(),
        getQueues(),
      ]);
      setHumanAgents(agentsData);
      setSupportQueues(queuesData);
    } catch (err) {
      console.error("Failed to fetch routing data", err);
    } finally {
      setLoadingRouting(false);
    }
  };

  const selectedAgent = aiAgents.find((a) => a.id === node.data.aiAssistantId);

  return (
    <div className="w-80 bg-white dark:bg-reply-panel-dark border-l border-gray-200 dark:border-reply-border-dark p-6 shadow-lg z-20 overflow-y-auto animate-slide-in-right h-full">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-bold text-gray-800 dark:text-white">Propiedades</h3>
        <button
          onClick={onDelete}
          className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors"
          title="Eliminar Nodo"
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
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>

      <div className="space-y-4">
        {/* COMMON: Label */}
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Etiqueta Interna
          </label>
          <input
            type="text"
            value={node.data.label}
            onChange={(e) => onUpdate("label", e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        {/* TYPE SPECIFIC FIELDS */}

        {/* MESSAGE NODE */}
        {node.type === "message" && (
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Contenido del Mensaje
            </label>
            <textarea
              rows={4}
              value={node.data.content || ""}
              onChange={(e) => onUpdate("content", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="Escribe el mensaje que se enviar al usuario..."
            />
            <p className="text-xs text-gray-400 mt-1">
              Puedes usar variables como {"{{nombre}}"}.
            </p>
          </div>
        )}

        {/* INPUT NODE */}
        {node.type === "input" && (
          <>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Pregunta al Usuario
              </label>
              <textarea
                rows={2}
                value={node.data.content || ""}
                onChange={(e) => onUpdate("content", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="¿Cul es tu correo?"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Guardar en Variable
              </label>
              <input
                type="text"
                placeholder="ej: email_cliente"
                value={node.data.variableName || ""}
                onChange={(e) => onUpdate("variableName", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </>
        )}

        {/* 🖼️ SEND_IMAGE NODE */}
        {node.type === "send_image" && (
          <>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">🖼️</span>
                <p className="text-xs font-bold text-blue-900 dark:text-blue-300">
                  Enviar Imagen
                </p>
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-400">
                Envía una imagen al usuario por WhatsApp
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                URL de la Imagen
              </label>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Imagen Seleccionada
              </label>
              {(node.data.mediaUrl || node.data.imageUrl) && (
                <div className="mb-2 p-2 bg-reply-bg dark:bg-gray-800 rounded border border-gray-200 dark:border-reply-border-dark flex items-center justify-between">
                  <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[180px]">
                    {(node.data.mediaUrl || node.data.imageUrl || "")
                      .split("/")
                      .pop()}
                  </span>
                  <button
                    onClick={() => {
                      onUpdate("mediaUrl", "");
                      onUpdate("imageUrl", "");
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                </div>
              )}
              <button
                onClick={() => {
                  setMediaModalType("IMAGE");
                  setShowMediaModal(true);
                }}
                className="mt-2 w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white py-2 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg"
              >
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" />
                </svg>
                📁 Seleccionar de Biblioteca Multimedia
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Mensaje Opcional (Caption)
              </label>
              <textarea
                rows={2}
                placeholder="Texto que acompaña la imagen..."
                value={node.data.message || node.data.content || ""}
                onChange={(e) => onUpdate("message", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </>
        )}

        {/* 🎥 SEND_VIDEO NODE */}
        {node.type === "send_video" && (
          <>
            <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg border border-purple-200 dark:border-purple-800 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">🎥</span>
                <p className="text-xs font-bold text-purple-900 dark:text-purple-300">
                  Enviar Video
                </p>
              </div>
              <p className="text-xs text-purple-700 dark:text-purple-400">
                Envía un video al usuario por WhatsApp
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                URL del Video
              </label>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Video Seleccionado
              </label>
              {(node.data.mediaUrl || node.data.videoUrl) && (
                <div className="mb-2 p-2 bg-reply-bg dark:bg-gray-800 rounded border border-gray-200 dark:border-reply-border-dark flex items-center justify-between">
                  <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[180px]">
                    {(node.data.mediaUrl || node.data.videoUrl || "")
                      .split("/")
                      .pop()}
                  </span>
                  <button
                    onClick={() => {
                      onUpdate("mediaUrl", "");
                      onUpdate("videoUrl", "");
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                </div>
              )}
              <button
                onClick={() => {
                  setMediaModalType("VIDEO");
                  setShowMediaModal(true);
                }}
                className="mt-2 w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white py-2 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg"
              >
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                </svg>
                📁 Seleccionar de Biblioteca Multimedia
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Mensaje Opcional (Caption)
              </label>
              <textarea
                rows={2}
                placeholder="Texto que acompaña el video..."
                value={node.data.message || node.data.content || ""}
                onChange={(e) => onUpdate("message", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
          </>
        )}

        {/* 🎵 SEND_AUDIO NODE */}
        {node.type === "send_audio" && (
          <>
            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-200 dark:border-green-800 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">🎵</span>
                <p className="text-xs font-bold text-green-900 dark:text-green-300">
                  Enviar Audio
                </p>
              </div>
              <p className="text-xs text-green-700 dark:text-green-400">
                Envía un archivo de audio o nota de voz
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                URL del Audio
              </label>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Audio Seleccionado
              </label>
              {(node.data.mediaUrl || node.data.audioUrl) && (
                <div className="mb-2 p-2 bg-reply-bg dark:bg-gray-800 rounded border border-gray-200 dark:border-reply-border-dark flex items-center justify-between">
                  <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[180px]">
                    {(node.data.mediaUrl || node.data.audioUrl || "")
                      .split("/")
                      .pop()}
                  </span>
                  <button
                    onClick={() => {
                      onUpdate("mediaUrl", "");
                      onUpdate("audioUrl", "");
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                </div>
              )}
              <button
                onClick={() => {
                  setMediaModalType("AUDIO");
                  setShowMediaModal(true);
                }}
                className="mt-2 w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white py-2 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg"
              >
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z"
                    clipRule="evenodd"
                  />
                </svg>
                📁 Seleccionar de Biblioteca Multimedia
              </button>
            </div>
          </>
        )}

        {/* 📄 SEND_DOCUMENT NODE */}
        {node.type === "send_document" && (
          <>
            <div className="bg-reply-bg dark:bg-gray-900/20 p-3 rounded-lg border border-gray-200 dark:border-reply-border-dark mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">📄</span>
                <p className="text-xs font-bold text-gray-900 dark:text-gray-300">
                  Enviar Documento
                </p>
              </div>
              <p className="text-xs text-gray-700 dark:text-gray-400">
                Envía un PDF, Word, Excel u otro documento
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                URL del Documento
              </label>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Documento Seleccionado
              </label>
              {(node.data.mediaUrl || node.data.documentUrl) && (
                <div className="mb-2 p-2 bg-reply-bg dark:bg-gray-800 rounded border border-gray-200 dark:border-reply-border-dark flex items-center justify-between">
                  <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[180px]">
                    {(node.data.mediaUrl || node.data.documentUrl || "")
                      .split("/")
                      .pop()}
                  </span>
                  <button
                    onClick={() => {
                      onUpdate("mediaUrl", "");
                      onUpdate("documentUrl", "");
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                </div>
              )}
              <button
                onClick={() => {
                  setMediaModalType("DOCUMENT");
                  setShowMediaModal(true);
                }}
                className="mt-2 w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white py-2 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg"
              >
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                    clipRule="evenodd"
                  />
                </svg>
                📁 Seleccionar de Biblioteca Multimedia
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Nombre del Archivo (Opcional)
              </label>
              <input
                type="text"
                placeholder="catalogo-productos.pdf"
                value={node.data.filename || ""}
                onChange={(e) => onUpdate("filename", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-gray-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                El nombre que ver el usuario al descargar
              </p>
            </div>
          </>
        )}

        {/* 💬 SEND_MESSAGE NODE */}
        {node.type === "send_message" && (
          <>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">💬</span>
                <p className="text-xs font-bold text-blue-900 dark:text-blue-300">
                  Enviar Mensaje de Texto
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Mensaje
              </label>
              <textarea
                rows={4}
                placeholder="Escribe el mensaje que se enviar..."
                value={node.data.message || node.data.content || ""}
                onChange={(e) => onUpdate("message", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                Puedes usar variables como {"{{nombre}}, {{email}}"}, etc.
              </p>
            </div>
          </>
        )}

        {/* ✍️ ASK_DATA NODE */}
        {node.type === "ask_data" && (
          <>
            <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-200 dark:border-orange-800 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">✍️</span>
                <p className="text-xs font-bold text-orange-900 dark:text-orange-300">
                  Solicitar Datos
                </p>
              </div>
              <p className="text-xs text-orange-700 dark:text-orange-400">
                El flujo se PAUSA hasta que el usuario responda
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Pregunta
              </label>
              <textarea
                rows={2}
                placeholder="¿Cul es tu nombre completo?"
                value={node.data.question || node.data.content || ""}
                onChange={(e) => onUpdate("question", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Guardar Respuesta en Variable
              </label>
              <input
                type="text"
                placeholder="nombre_usuario"
                value={node.data.variable || node.data.variableName || ""}
                onChange={(e) => onUpdate("variable", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-orange-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                Luego puedes usar {"{{nombre_usuario}}"} en otros mensajes
              </p>
            </div>
          </>
        )}

        {/* ✨ AI AGENT NODE - NUEVA INTEGRACIÓN */}
        {node.type === "ai_agent" && (
          <>
            <div className="bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 p-4 rounded-lg border border-cyan-200 dark:border-cyan-800 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🤖</span>
                <p className="text-xs font-bold text-cyan-900 dark:text-cyan-300">
                  Agente IA Inteligente
                </p>
              </div>
              <p className="text-xs text-cyan-700 dark:text-cyan-400">
                Selecciona un agente existente de "IA & Conocimiento" o crea uno
                nuevo.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">
                🎯 Seleccionar Agente IA
              </label>

              {loadingAgents ? (
                <div className="w-full p-3 bg-reply-bg dark:bg-gray-800 rounded-lg text-center">
                  <div className="animate-spin inline-block w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full"></div>
                  <p className="text-xs text-gray-500 mt-2">
                    Cargando agentes...
                  </p>
                </div>
              ) : (
                <>
                  <select
                    value={node.data.aiAssistantId || ""}
                    onChange={(e) => onUpdate("aiAssistantId", e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                  >
                    <option value="">⚠️ Seleccionar Agente...</option>
                    {aiAgents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        🤖 {agent.name}
                      </option>
                    ))}
                  </select>

                  {fetchError && (
                    <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-center">
                      <p className="text-xs text-red-600 dark:text-red-400 mb-1">
                        Error al cargar agentes
                      </p>
                      <button
                        onClick={fetchAIAgents}
                        className="text-xs font-bold text-red-700 dark:text-red-300 underline"
                      >
                        Reintentar
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Botón para crear nuevo agente */}
              <a
                href="/ai-assistants"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block w-full px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg text-xs text-center font-bold shadow-md hover:shadow-lg transition-all"
              >
                + Crear Nuevo Agente IA
              </a>
            </div>

            {/* Preview del agente seleccionado */}
            {selectedAgent && (
              <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 mb-2">
                  <svg
                    className="w-4 h-4 text-green-600 dark:text-green-400"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                  <p className="text-xs font-bold text-green-800 dark:text-green-300">
                    Agente Configurado
                  </p>
                </div>

                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Nombre:
                    </p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">
                      {selectedAgent.name}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Modelo:
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {selectedAgent.modelName ||
                        selectedAgent.model ||
                        "Unknown Model"}
                    </p>
                  </div>

                  {selectedAgent.description && (
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Descripción:
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 italic">
                        {selectedAgent.description}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Warning si no hay agente seleccionado */}
            {!node.data.aiAssistantId && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-start gap-2">
                  <svg
                    className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                  </svg>
                  <div>
                    <p className="text-xs font-bold text-yellow-800 dark:text-yellow-300">
                      Agente no seleccionado
                    </p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                      El flujo no funcionar hasta que selecciones un agente IA.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* AI HANDOFF NODE (Transfer to Human) */}
        {node.type === "ai_handoff" && (
          <>
            <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-200 dark:border-orange-800 mb-2">
              <p className="text-xs text-orange-800 dark:text-orange-300">
                Este nodo transferir la conversación a un agente humano.
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Mensaje de Transferencia
              </label>
              <textarea
                rows={3}
                value={
                  node.data.content ||
                  "Te estoy conectando con un agente humano..."
                }
                onChange={(e) => onUpdate("content", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
          </>
        )}
        {/* ❓ CONDITION NODE - Ramificación */}
        {node.type === "condition" && (
          <>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">❓</span>
                <p className="text-xs font-bold text-yellow-900 dark:text-yellow-300">
                  Condición / Ramificación
                </p>
              </div>
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                El flujo toma diferentes caminos según la respuesta del usuario
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Variable a Evaluar
              </label>
              <input
                type="text"
                placeholder="nombre_variable"
                value={node.data.variable || node.data.variableName || ""}
                onChange={(e) => onUpdate("variable", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-yellow-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                Ej: respuesta_usuario, email, nombre
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Tipo de Condición
              </label>
              <select
                value={node.data.operator || "equals"}
                onChange={(e) => onUpdate("operator", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-yellow-500 outline-none"
              >
                <option value="equals">Es igual a</option>
                <option value="contains">Contiene</option>
                <option value="starts_with">Comienza con</option>
                <option value="ends_with">Termina con</option>
                <option value="greater_than">Mayor que (número)</option>
                <option value="less_than">Menor que (número)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Valor a Comparar
              </label>
              <input
                type="text"
                placeholder='Ej: "sí", "no", "@gmail.com"'
                value={node.data.value || node.data.condition || ""}
                onChange={(e) => onUpdate("value", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-yellow-500 outline-none"
              />
            </div>

            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-xs text-blue-800 dark:text-blue-300">
                💡 <strong>Cómo funciona:</strong> Conecta diferentes nodos a
                este nodo de condición. Si la condición es verdadera, seguir un
                camino. Si es falsa, seguir otro.
              </p>
            </div>
          </>
        )}

        {/* 💰 CREATE_DEAL NODE - Crear Negocio */}
        {node.type === "create_deal" && (
          <>
            <div className="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">💰</span>
                <p className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                  Crear Deal
                </p>
              </div>
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                Crea automticamente un nuevo negocio en el CRM
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Título del Deal
              </label>
              <input
                type="text"
                placeholder="Ej: Venta - {{nombre}}"
                value={node.data.title || ""}
                onChange={(e) => onUpdate("title", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                Puedes usar variables como {"{{nombre}}, {{email}}"}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Valor del Deal (Opcional)
              </label>
              <input
                type="number"
                placeholder="1000"
                value={node.data.value || ""}
                onChange={(e) => onUpdate("value", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Pipeline (Opcional)
              </label>
              <input
                type="text"
                placeholder="ID del pipeline"
                value={node.data.pipelineId || ""}
                onChange={(e) => onUpdate("pipelineId", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                Si estáá vacío, usar el pipeline por defecto
              </p>
            </div>
          </>
        )}

        {/* 👤 UPDATE_CONTACT NODE - Actualizar Contacto */}
        {node.type === "update_contact" && (
          <>
            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-200 dark:border-indigo-800 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">👤</span>
                <p className="text-xs font-bold text-indigo-900 dark:text-indigo-300">
                  Actualizar Contacto
                </p>
              </div>
              <p className="text-xs text-indigo-700 dark:text-indigo-400">
                Actualiza los campos del contacto con datos capturados
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Campo: Nombre
              </label>
              <input
                type="text"
                placeholder="{{nombre_usuario}}"
                value={node.data.name || ""}
                onChange={(e) => onUpdate("name", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Campo: Email
              </label>
              <input
                type="text"
                placeholder="{{email_usuario}}"
                value={node.data.email || ""}
                onChange={(e) => onUpdate("email", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Campo: Teléfono
              </label>
              <input
                type="text"
                placeholder="{{teléfono}}"
                value={node.data.phone || ""}
                onChange={(e) => onUpdate("phone", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Campos Personalizados (JSON)
              </label>
              <textarea
                rows={3}
                placeholder='{"empresa": "{{empresa}}", "cargo": "{{cargo}}"}'
                value={node.data.customFields || ""}
                onChange={(e) => onUpdate("customFields", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </>
        )}

        {/* 🎯 ASSIGN_AGENT NODE - Asignar Agente */}
        {node.type === "assign_agent" && (
          <>
            <div className="bg-pink-50 dark:bg-pink-900/20 p-3 rounded-lg border border-pink-200 dark:border-pink-800 mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">🎯</span>
                <p className="text-xs font-bold text-pink-900 dark:text-pink-300">
                  Enrutamiento Humano
                </p>
              </div>
              <p className="text-xs text-pink-700 dark:text-pink-400">
                Transfiere el chat a un humano o equipo específico.
              </p>
            </div>

            {/* 🎛️ Routing Mode Selector */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg mb-4">
              <button
                onClick={() => {
                  onUpdate("assignmentType", "agent");
                  onUpdate("queueId", undefined); // Clear queue
                }}
                className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-md text-xs font-bold transition-all ${
                  node.data.assignmentType !== "queue"
                    ? "bg-white dark:bg-gray-600 text-pink-600 dark:text-pink-300 shadow-sm"
                    : "text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                👤 Agente
              </button>
              <button
                onClick={() => {
                  onUpdate("assignmentType", "queue");
                  onUpdate("agentId", undefined); // Clear agent
                }}
                className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-md text-xs font-bold transition-all ${
                  node.data.assignmentType === "queue"
                    ? "bg-white dark:bg-gray-600 text-pink-600 dark:text-pink-300 shadow-sm"
                    : "text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                👥 Cola
              </button>
            </div>

            {/* 👤 AGENT MODE - DROPDOWN */}
            {node.data.assignmentType !== "queue" && (
              <div className="mb-4 animate-fadeIn">
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                  Agente Responsable
                </label>
                {loadingRouting ? (
                  <div className="text-xs text-gray-400">
                    Cargando agentes...
                  </div>
                ) : (
                  <select
                    value={node.data.agentId || ""}
                    onChange={(e) => onUpdate("agentId", e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-pink-500"
                  >
                    <option value="">-- Seleccionar Agente --</option>
                    {humanAgents.map((agent: any) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} ({agent.email})
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  El chat se asignar directamente a este usuario.
                </p>
              </div>
            )}

            {/* 👥 QUEUE MODE - DROPDOWN */}
            {node.data.assignmentType === "queue" && (
              <div className="mb-4 animate-fadeIn">
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                  Cola de Atención
                </label>
                {loadingRouting ? (
                  <div className="text-xs text-gray-400">Cargando colas...</div>
                ) : (
                  <select
                    value={node.data.queueId || ""}
                    onChange={(e) => onUpdate("queueId", e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-pink-500"
                  >
                    <option value="">-- Seleccionar Cola --</option>
                    {supportQueues.map((q: any) => (
                      <option key={q.id} value={q.id}>
                        {q.name}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  El chat esperar en esta cola hasta que un agente lo tome.
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Mensaje de Transición
              </label>
              <textarea
                rows={2}
                placeholder="Un momento, transfiriendo tu chat..."
                value={node.data.message || ""}
                onChange={(e) => onUpdate("message", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-pink-500 outline-none"
              />
            </div>

            <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg flex gap-2">
              <span className="text-lg">⚠️</span>
              <p className="text-xs text-orange-800 dark:text-orange-300">
                El bot se <strong>detendrá</strong> y el chat pasar a estado{" "}
                {node.data.assignmentType === "queue"
                  ? "PENDIENTE"
                  : "ASIGNADO"}
                .
              </p>
            </div>
          </>
        )}

        {/* ⏱️ DELAY NODE - Esperar */}
        {node.type === "delay" && (
          <>
            <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-200 dark:border-orange-800 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">⏱️</span>
                <p className="text-xs font-bold text-orange-900 dark:text-orange-300">
                  Delay / Espera
                </p>
              </div>
              <p className="text-xs text-orange-700 dark:text-orange-400">
                Pausa el flujo durante un tiempo específico antes de continuar
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Duración
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="5"
                  value={node.data.delayValue || ""}
                  onChange={(e) => onUpdate("delayValue", e.target.value)}
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                />
                <select
                  value={node.data.delayUnit || "minutes"}
                  onChange={(e) => onUpdate("delayUnit", e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                >
                  <option value="seconds">Segundos</option>
                  <option value="minutes">Minutos</option>
                  <option value="hours">Horas</option>
                  <option value="days">Días</option>
                </select>
              </div>
            </div>

            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-xs text-blue-800 dark:text-blue-300">
                💡 El flujo continuar automticamente después del tiempo
                especificado
              </p>
            </div>
          </>
        )}

        {/* 🏁 END NODE - Fin del Flujo */}
        {node.type === "end" && (
          <>
            <div className="bg-reply-bg dark:bg-gray-900/20 p-3 rounded-lg border border-gray-200 dark:border-reply-border-dark mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">🏁</span>
                <p className="text-xs font-bold text-gray-900 dark:text-gray-300">
                  Fin del Flujo
                </p>
              </div>
              <p className="text-xs text-gray-700 dark:text-gray-400">
                Finaliza el flujo de automatización
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Mensaje de Despedida (Opcional)
              </label>
              <textarea
                rows={3}
                placeholder="¡Gracias por tu tiempo! Nos pondremos en contacto pronto."
                value={node.data.message || ""}
                onChange={(e) => onUpdate("message", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-gray-500 outline-none"
              />
            </div>

            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-xs text-green-800 dark:text-green-300">
                ✅ El flujo se detendr completamente después de este nodo
              </p>
            </div>
          </>
        )}

        {/* 🔄 AI_HANDOFF NODE */}
        {node.type === "ai_handoff" && (
          <>
            <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-200 dark:border-orange-800 mb-2">
              <p className="text-xs text-orange-800 dark:text-orange-300">
                Este nodo transferir la conversación a un agente humano.
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Mensaje de Transferencia
              </label>
              <textarea
                rows={3}
                value={
                  node.data.content ||
                  "Te estoy conectando con un agente humano..."
                }
                onChange={(e) => onUpdate("content", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
          </>
        )}

        {/* ACTION EMAIL NODE */}
        {node.type === "action_email" && (
          <>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Destinatario
              </label>
              <input
                type="text"
                placeholder="ej: cliente@email.com o {{email}}"
                value={node.data.options?.[0] || ""}
                onChange={(e) =>
                  onUpdate("options", [
                    e.target.value,
                    node.data.options?.[1] || "",
                  ])
                }
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Asunto
              </label>
              <input
                type="text"
                placeholder="Asunto del correo"
                value={node.data.options?.[1] || ""}
                onChange={(e) =>
                  onUpdate("options", [
                    node.data.options?.[0] || "",
                    e.target.value,
                  ])
                }
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Cuerpo del Correo
              </label>
              <textarea
                rows={4}
                value={node.data.content || ""}
                onChange={(e) => onUpdate("content", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Hola {{nombre}}, ..."
              />
            </div>
          </>
        )}

        {/* ACTION CALENDAR NODE */}
        {node.type === "action_calendar" && (
          <>
            <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800 mb-4">
              <div className="flex items-center gap-2 mb-1">
                <svg
                  className="w-5 h-5 text-red-600"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5z" />
                </svg>
                <p className="text-xs font-bold text-red-800 dark:text-red-300">
                  Integración Google Calendar
                </p>
              </div>
              <p className="text-xs text-red-600 dark:text-red-300">
                Este nodo enviar opciones de horario disponibles o un link de
                agendamiento al usuario.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Título del Evento
              </label>
              <input
                type="text"
                placeholder="ej: Demo de Producto"
                value={node.data.label || ""}
                onChange={(e) => onUpdate("label", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-red-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Duración (minutos)
              </label>
              <select
                value={node.data.options?.[0] || "30"}
                onChange={(e) =>
                  onUpdate("options", [
                    e.target.value,
                    node.data.options?.[1] || "",
                  ])
                }
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-red-500 outline-none"
              >
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">60 min (1 hr)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Link de Calendario (Opcional)
              </label>
              <input
                type="text"
                placeholder="https://calendar.google.com/..."
                value={node.data.options?.[1] || ""}
                onChange={(e) =>
                  onUpdate("options", [
                    node.data.options?.[0] || "30",
                    e.target.value,
                  ])
                }
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-red-500 outline-none"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Si se deja vacío, se usar la integración nativa de Google
                Calendar.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Mensaje de Éxito
              </label>
              <textarea
                rows={2}
                value={
                  node.data.content ||
                  "¡Listo! Tu cita ha sido agendada para {{fecha}}."
                }
                onChange={(e) => onUpdate("content", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-red-500 outline-none"
              />
            </div>
          </>
        )}

        {/* ACTION TASK NODE */}
        {node.type === "action_task" && (
          <>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Título de la Tarea
              </label>
              <input
                type="text"
                placeholder="ej: Llamar al cliente"
                value={node.data.label || ""}
                onChange={(e) => onUpdate("label", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Descripción
              </label>
              <textarea
                rows={3}
                value={node.data.content || ""}
                onChange={(e) => onUpdate("content", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Detalles de la tarea..."
              />
            </div>
          </>
        )}

        <div className="pt-4 border-t border-gray-200 dark:border-reply-border-dark mt-auto">
          <p className="text-xs text-gray-400">ID: {node.id}</p>
          <p className="text-xs text-gray-400">
            Tipo: {node.type.toUpperCase()}
          </p>
        </div>
      </div>

      {/* Media Selector Modal */}
      {showMediaModal && (
        <MediaSelectorModal
          type={mediaModalType}
          onSelect={(asset) => {
            const url = asset.fileUrl || asset.url;
            onUpdate("mediaUrl", url);
            onUpdate("mediaAssetId", asset.id);

            // Update specific legacy fields for backend compatibility
            if (mediaModalType === "IMAGE") onUpdate("imageUrl", url);
            if (mediaModalType === "VIDEO") onUpdate("videoUrl", url);
            if (mediaModalType === "AUDIO") onUpdate("audioUrl", url);
            if (mediaModalType === "DOCUMENT") onUpdate("documentUrl", url);

            setShowMediaModal(false);
          }}
          onClose={() => setShowMediaModal(false)}
        />
      )}
    </div>
  );
};



