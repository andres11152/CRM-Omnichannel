import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { API_BASE_URL } from "@/services/apiConfig";
import { Flow, FlowNode, NodeType } from "@/types";
import { FlowSidebar } from "./FlowSidebar";
import { FlowCanvas } from "./FlowCanvas";
import { FlowPropertiesPanel } from "./FlowPropertiesPanel";
import { ModuleHeader } from "../common/ModuleHeader";

export const FlowBuilder: React.FC = () => {
  const { id: flowId } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [flow, setFlow] = useState<Flow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);

  // Connection State
  const [connectingNodeId, setConnectingNodeId] = useState<string | null>(null);

  // Load flow from backend (if editing) or initialize new flow
  useEffect(() => {
    loadFlow();
  }, [flowId]);

  async function loadFlow() {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");

      if (flowId) {
        // Load existing flow
        const response = await fetch(`${API_BASE_URL}/flows/${flowId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) throw new Error("Flow not found");

        const data = await response.json();
        setFlow(data);
        toast.success("Flujo cargado exitosamente");
      } else {
        // Initialize new flow
        setFlow({
          id: "",
          companyId: "",
          name: 'Nuevo Flujo (Trigger: "hola")',
          triggerType: "KEYWORD",
          triggerConfig: { keyword: "hola" },
          nodes: [],
          edges: [],
          isActive: true,
        });
      }
    } catch (error) {
      console.error("[FlowBuilder] Load error:", error);
      toast.error("Error al cargar el flujo");
      // Fallback
      setFlow({
        id: "",
        companyId: "",
        name: "Nuevo Flujo (Offline)",
        triggerType: "KEYWORD",
        triggerConfig: { keyword: "error" },
        nodes: [],
        edges: [],
        isActive: true,
      });
    } finally {
      setLoading(false);
    }
  }

  if (!flow) return <div className="p-8 text-center">Cargando flow...</div>;

  // --- ACTIONS ---

  const handleNodeDragStart = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = flow.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    setSelectedNodeId(nodeId);
    setDraggedNodeId(nodeId);
    setIsDragging(true);

    // Calculate offset within the node
    const rect = (e.target as HTMLElement)
      .closest(".flow-node")
      ?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  const handleNodeConnectStart = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setConnectingNodeId(nodeId);
  };

  const handleNodeConnectEnd = (e: React.MouseEvent, targetNodeId: string) => {
    e.stopPropagation();
    if (!connectingNodeId || connectingNodeId === targetNodeId) return;

    // Create Edge
    const newEdge = {
      id: `edge_${Date.now()}`,
      source: connectingNodeId,
      target: targetNodeId,
    };

    setFlow((prev) =>
      prev ? { ...prev, edges: [...prev.edges, newEdge] } : null,
    );
    setConnectingNodeId(null);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isDragging && draggedNodeId) {
      // We need to calculate relative to the canvas container.
      // Since we don't have the ref here easily (it's in child), we can use e.currentTarget if the event bubbles up?
      // Actually, onCanvasMouseMove is attached to the canvas div in FlowCanvas.
      // So e.currentTarget is the canvas div.

      const canvasRect = (
        e.currentTarget as HTMLElement
      ).getBoundingClientRect();
      const x = e.clientX - canvasRect.left - dragOffset.x;
      const y = e.clientY - canvasRect.top - dragOffset.y;

      setFlow((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === draggedNodeId ? { ...n, position: { x, y } } : n,
          ),
        };
      });
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
    setDraggedNodeId(null);
    setConnectingNodeId(null); // Cancel connection if dropped on canvas
  };

  const handleAddNode = (type: NodeType) => {
    if (!flow) return;

    // Map node types to user-friendly labels
    const nodeLabelMap: Record<NodeType, string> = {
      trigger: "Inicio",
      send_message: "Enviar Mensaje",
      send_image: "Enviar Imagen",
      send_video: "Enviar Video",
      send_audio: "Enviar Audio",
      send_document: "Enviar Documento",
      ask_data: "Solicitar Datos",
      condition: "Condición",
      ai_agent: "Agente IA",
      create_deal: "Crear Deal",
      update_contact: "Actualizar Contacto",
      assign_agent: "Asignar Agente",
      ai_handoff: "Transferir a Humano",
      delay: "Espera",
      end: "Fin",
      message: "Mensaje (Legacy)",
      input: "Input (Legacy)",
      action_task: "Tarea CRM",
      action_calendar: "Calendario",
      action_email: "Email",
    };

    const newNode: FlowNode = {
      id: `node_${Date.now()}`,
      type,
      position: { x: 250, y: 150 }, // Default center-ish
      data: {
        label: nodeLabelMap[type] || "Nuevo Nodo",
        content: "",
        options: [],
      },
    };
    setFlow({ ...flow, nodes: [...flow.nodes, newNode] });
    setSelectedNodeId(newNode.id);
  };

  const handleDeleteNode = () => {
    if (!selectedNodeId || !flow) return;
    setFlow({
      ...flow,
      nodes: flow.nodes.filter((n) => n.id !== selectedNodeId),
      edges: flow.edges.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
      ),
    });
    setSelectedNodeId(null);
  };

  const updateNodeData = (key: string, value: unknown) => {
    setFlow((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === selectedNodeId
            ? { ...n, data: { ...n.data, [key]: value } }
            : n,
        ),
      };
    });
  };

  const selectedNode = flow.nodes.find((n) => n.id === selectedNodeId);

  const handleSaveFlow = async () => {
    if (!flow) return;
    setSaving(true);
    try {
      const method = flow.id ? "PUT" : "POST";
      const url = flow.id
        ? `${API_BASE_URL}/flows/${flow.id}`
        : `${API_BASE_URL}/flows`;

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(flow),
      });

      if (!response.ok) throw new Error("Failed to save flow");

      const resData = await response.json();
      const savedFlow = resData.data || resData; // Handle both wrapper and direct formats

      setFlow(savedFlow);
      toast.success("Flujo guardado correctamente");

      // If new flow was created, navigate to edit URL
      if (method === "POST" && savedFlow.id) {
        navigate(`/chatbot/flujos/${savedFlow.id}/editar`, { replace: true });
      }
    } catch (error) {
      console.error("Error saving flow:", error);
      toast.error("Error al guardar el flujo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-100 dark:bg-reply-bg-dark overflow-hidden transition-colors duration-200">
      {/* HEADER */}
      <ModuleHeader
        title="Constructor de Flujos"
        description={`Editando: ${flow.name} (Trigger: "${flow.triggerConfig?.keyword || flow.triggerConfig?.event || "Sin trigger"}")`}
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
        gradient="from-slate-600 to-gray-600 dark:from-slate-800 dark:to-gray-800"
        action={
          <div className="flex gap-3">
            <button
              onClick={handleSaveFlow}
              className="px-6 py-2 bg-white text-indigo-600 hover:bg-gray-100 rounded-lg text-sm font-bold shadow-md transition-colors"
            >
              Guardar Flujo
            </button>
          </div>
        }
      />

      <div className="flex-1 flex overflow-hidden relative">
        {/* LEFT: TOOLBAR */}
        <FlowSidebar onAddNode={handleAddNode} />

        {/* CENTER: CANVAS */}
        <FlowCanvas
          nodes={flow.nodes}
          edges={flow.edges}
          selectedNodeId={selectedNodeId}
          onNodeSelect={setSelectedNodeId}
          onNodeDragStart={handleNodeDragStart}
          onCanvasMouseMove={handleCanvasMouseMove}
          onCanvasMouseUp={handleCanvasMouseUp}
          onCanvasClick={() => setSelectedNodeId(null)}
          connectingNodeId={connectingNodeId}
          onNodeConnectStart={handleNodeConnectStart}
          onNodeConnectEnd={handleNodeConnectEnd}
        />

        {/* RIGHT: PROPERTIES PANEL */}
        {/* RIGHT: PROPERTIES PANEL */}
        {selectedNode ? (
          <FlowPropertiesPanel
            node={selectedNode}
            onUpdate={updateNodeData}
            onDelete={handleDeleteNode}
          />
        ) : (
          <div className="w-80 bg-white dark:bg-reply-surface-dark border-l border-gray-200 dark:border-reply-border-dark flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-reply-border-dark">
              <h3 className="font-bold text-gray-800 dark:text-white">
                Configuración del Flujo
              </h3>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Nombre
                </label>
                <input
                  type="text"
                  value={flow.name}
                  onChange={(e) => setFlow({ ...flow, name: e.target.value })}
                  className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded p-2 text-sm text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Tipo de Disparador
                </label>
                <select
                  value={flow.triggerType}
                  onChange={(e) =>
                    setFlow({
                      ...flow,
                      triggerType: e.target.value as "KEYWORD" | "EVENT",
                    })
                  }
                  className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded p-2 text-sm text-gray-800 dark:text-white"
                >
                  <option value="KEYWORD">Palabra Clave (Chatbot)</option>
                  <option value="EVENT">Evento CRM (Automations)</option>
                </select>
              </div>

              {flow.triggerType === "KEYWORD" && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                    Palabra Clave
                  </label>
                  <input
                    type="text"
                    value={flow.triggerConfig?.keyword || ""}
                    onChange={(e) =>
                      setFlow({
                        ...flow,
                        triggerConfig: {
                          ...flow.triggerConfig,
                          keyword: e.target.value,
                        },
                      })
                    }
                    className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded p-2 text-sm text-gray-800 dark:text-white"
                    placeholder="Ej: hola, precios"
                  />
                </div>
              )}

              {flow.triggerType === "EVENT" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                      Evento
                    </label>
                    <select
                      value={flow.triggerConfig?.event || ""}
                      onChange={(e) =>
                        setFlow({
                          ...flow,
                          triggerConfig: {
                            ...flow.triggerConfig,
                            event: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded p-2 text-sm text-gray-800 dark:text-white"
                    >
                      <option value="">Seleccionar Evento...</option>
                      <option value="DEAL_CREATED">Nuevo Deal Creado</option>
                      <option value="DEAL_UPDATED">
                        Deal Actualizado (Cambio de Etapa)
                      </option>
                    </select>
                  </div>

                  {flow.triggerConfig?.event === "DEAL_UPDATED" && (
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                        Condición: Nueva Etapa
                      </label>
                      <select
                        value={flow.triggerConfig?.condition?.stage || ""}
                        onChange={(e) =>
                          setFlow({
                            ...flow,
                            triggerConfig: {
                              ...flow.triggerConfig,
                              condition: {
                                ...flow.triggerConfig?.condition,
                                stage: e.target.value,
                              },
                            },
                          })
                        }
                        className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded p-2 text-sm text-gray-800 dark:text-white"
                      >
                        <option value="">Cualquier Etapa</option>
                        <option value="WON">Ganado (Won)</option>
                        <option value="LOST">Perdido (Lost)</option>
                        <option value="NEGOTIATION">Negociación</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};



