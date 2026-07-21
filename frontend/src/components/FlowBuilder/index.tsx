import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { API_BASE_URL } from "@/services/apiConfig";
import { Flow, FlowNode, FlowConnection, NodeType } from "@/types";
import { FlowSidebar } from "./FlowSidebar";
import { FlowCanvas } from "./FlowCanvas";
import { FlowPropertiesPanel } from "./FlowPropertiesPanel";
import { ModuleHeader } from "../common/ModuleHeader";
import { NODE_REGISTRY } from "./nodes/FlowNodeRegistry";
import { Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";

// ==========================================
//  CONSTANTS
// ==========================================

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.1;
const MAX_UNDO = 30;

// ==========================================
//  AUTO-LAYOUT ALGORITHM
// ==========================================

function autoLayoutNodes(nodes: FlowNode[], edges: FlowConnection[]): FlowNode[] {
  if (nodes.length === 0) return nodes;

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const edge of edges) {
    const kids = children.get(edge.source) || [];
    kids.push(edge.target);
    children.set(edge.source, kids);
    hasParent.add(edge.target);
  }

  // Find roots (nodes with no incoming edges)
  const roots = nodes.filter(n => !hasParent.has(n.id));
  if (roots.length === 0) roots.push(nodes[0]);

  const positioned = new Map<string, { x: number; y: number }>();
  const COL_GAP = 300;
  const ROW_GAP = 140;

  function layout(nodeId: string, col: number, rowOffset: number): number {
    if (positioned.has(nodeId)) return rowOffset;

    positioned.set(nodeId, { x: 280 + col * COL_GAP, y: 40 + rowOffset * ROW_GAP });

    const kids = children.get(nodeId) || [];
    let nextRow = rowOffset;
    for (const kid of kids) {
      if (!positioned.has(kid)) {
        layout(kid, col + 1, nextRow);
        nextRow++;
      }
    }
    return Math.max(nextRow, rowOffset + 1);
  }

  let globalRow = 0;
  for (const root of roots) {
    globalRow = layout(root.id, 0, globalRow);
  }

  // Position any unconnected nodes
  for (const node of nodes) {
    if (!positioned.has(node.id)) {
      positioned.set(node.id, { x: 280, y: 40 + globalRow * ROW_GAP });
      globalRow++;
    }
  }

  return nodes.map(n => ({ ...n, position: positioned.get(n.id) || n.position }));
}

// ==========================================
//  FLOW BUILDER
// ==========================================

export const FlowBuilder: React.FC = () => {
  const { t } = useTranslation();
  const { id: flowId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [flow, setFlow] = useState<Flow | null>(null);
  const [stats, setStats] = useState<{ totalSessions: number; activeSessions: number; completedSessions: number; nodeStats: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectingNodeId, setConnectingNodeId] = useState<string | null>(null);
  const [connectingPortLabel, setConnectingPortLabel] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);

  // Zoom & Pan
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Undo stack
  const [undoStack, setUndoStack] = useState<Flow[]>([]);

  const pushUndo = useCallback((current: Flow) => {
    setUndoStack(prev => [...prev.slice(-MAX_UNDO), current]);
  }, []);

  // ── LOAD FLOW ──

  useEffect(() => { loadFlow(); }, [flowId]);

  async function loadFlow() {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (flowId) {
        const response = await fetch(`${API_BASE_URL}/flows/${flowId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Flow not found");
        const data = await response.json();
        setFlow(data);
        
        try {
          const statsRes = await fetch(`${API_BASE_URL}/flows/${flowId}/stats`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (statsRes.ok) {
            setStats(await statsRes.json());
          }
        } catch (e) {
          console.error("Failed to load flow stats:", e);
        }
        
        toast.success(t("queues_config.toasts.created_success"));
      } else {
        setFlow({
          id: "", 
          companyId: "", 
          name: t("common.new"), 
          triggerType: "KEYWORD",
          triggerConfig: { keyword: "hello" }, 
          nodes: [], 
          edges: [], 
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error("[FlowBuilder] Load error:", error);
      toast.error(t("common.error"));
      setFlow({
        id: "", 
        companyId: "", 
        name: `${t("common.new")} (${t("common.error")})`,
        triggerType: "KEYWORD",
        triggerConfig: { keyword: "error" }, 
        nodes: [], 
        edges: [], 
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } finally { setLoading(false); }
  }

  // ── KEYBOARD SHORTCUTS ──

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+S: Save
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSaveFlow();
        return;
      }

      // Ctrl+Z: Undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Delete/Backspace: Delete selected node or edge
      if (e.key === "Delete" || e.key === "Backspace") {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
        e.preventDefault();

        if (selectedEdgeId && flow) {
          pushUndo(flow);
          setFlow({ ...flow, edges: flow.edges.filter(ed => ed.id !== selectedEdgeId) });
          setSelectedEdgeId(null);
          toast.success(t("queues_config.toasts.deleted_success"));
        } else if (selectedNodeId) {
          handleDeleteNode();
        }
        return;
      }

      // Escape: Deselect
      if (e.key === "Escape") {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setConnectingNodeId(null);
        setConnectingPortLabel(null);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedNodeId, selectedEdgeId, flow, undoStack]);

  // ── ACTIONS ──

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setFlow(previous);
    toast.info(t("flow_builder.toast.change_reverted", "Cambio revertido"));
  }, [undoStack]);

  const handleNodeDragStart = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = flow?.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setDraggedNodeId(nodeId);
    setIsDragging(true);

    const rect = (e.target as HTMLElement).closest(".flow-node")?.getBoundingClientRect();
    if (rect) {
      setDragOffset({ x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom });
    }
  };

  const handleNodeConnectStart = (e: React.MouseEvent, nodeId: string, label?: string) => {
    e.stopPropagation();
    setConnectingNodeId(nodeId);
    setConnectingPortLabel(label || null);
  };

  const handleNodeConnectEnd = (e: React.MouseEvent, targetNodeId: string) => {
    e.stopPropagation();
    if (!connectingNodeId || connectingNodeId === targetNodeId || !flow) return;

    pushUndo(flow);
    const newEdge: FlowConnection = {
      id: `edge_${Date.now()}`,
      source: connectingNodeId,
      target: targetNodeId,
      label: connectingPortLabel || undefined,
    };
    setFlow({ ...flow, edges: [...flow.edges, newEdge] });
    setConnectingNodeId(null);
    setConnectingPortLabel(null);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPanX(e.clientX - panStart.x);
      setPanY(e.clientY - panStart.y);
      return;
    }

    if (isDragging && draggedNodeId && flow) {
      const canvasRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = (e.clientX - canvasRect.left - panX) / zoom - dragOffset.x;
      const y = (e.clientY - canvasRect.top - panY) / zoom - dragOffset.y;

      setFlow(prev => {
        if (!prev) return null;
        return { ...prev, nodes: prev.nodes.map(n => n.id === draggedNodeId ? { ...n, position: { x, y } } : n) };
      });
    }
  };

  const handleCanvasMouseUp = () => {
    if (isDragging && flow) pushUndo(flow);
    setIsDragging(false);
    setDraggedNodeId(null);
    setConnectingNodeId(null);
    setConnectingPortLabel(null);
    setIsPanning(false);
  };

  const handlePanStart = (e: React.MouseEvent) => {
    // Enable simple left-click drag to pan (button === 0) on empty canvas,
    // as well as middle-click (button === 1) or Alt+left-click.
    if (e.button === 0 || e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - panX, y: e.clientY - panY });
    }
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom(prev => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev + delta)));
  }, []);

  const handleAddNode = (type: NodeType) => {
    if (!flow) return;
    pushUndo(flow);

    const existingCount = flow.nodes.length;
    const newNode: FlowNode = {
      id: `node_${Date.now()}`,
      type,
      position: { x: 280 + (existingCount % 3) * 260, y: 60 + Math.floor(existingCount / 3) * 160 },
      data: { label: t(NODE_REGISTRY[type]?.label || "common.new"), content: "", options: [] },
    };
    setFlow({ ...flow, nodes: [...flow.nodes, newNode] });
    setSelectedNodeId(newNode.id);
    setSelectedEdgeId(null);
  };

  const handleDeleteNode = () => {
    if (!selectedNodeId || !flow) return;
    pushUndo(flow);
    setFlow({
      ...flow,
      nodes: flow.nodes.filter(n => n.id !== selectedNodeId),
      edges: flow.edges.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId),
    });
    setSelectedNodeId(null);
    toast.success(t("queues_config.toasts.deleted_success"));
  };

  const updateNodeData = (key: string, value: unknown) => {
    setFlow(prev => {
      if (!prev) return null;
      return { ...prev, nodes: prev.nodes.map(n => n.id === selectedNodeId ? { ...n, data: { ...n.data, [key]: value } } : n) };
    });
  };

  // ── ZOOM CONTROLS ──

  const handleZoomIn = () => setZoom(prev => Math.min(ZOOM_MAX, prev + ZOOM_STEP));
  const handleZoomOut = () => setZoom(prev => Math.max(ZOOM_MIN, prev - ZOOM_STEP));

  const handleFitView = useCallback(() => {
    if (!flow || flow.nodes.length === 0) { setZoom(1); setPanX(40); setPanY(20); return; }
    const el = containerRef.current;
    if (!el) return;

    const allX = [50, ...flow.nodes.map(n => n.position.x)];
    const allY = [150, ...flow.nodes.map(n => n.position.y)];
    const minX = Math.min(...allX) - 60, maxX = Math.max(...allX) + 280;
    const minY = Math.min(...allY) - 60, maxY = Math.max(...allY) + 160;
    const worldW = maxX - minX, worldH = maxY - minY;
    const cw = el.clientWidth - 96, ch = el.clientHeight;
    const newZoom = Math.min(1.2, Math.max(ZOOM_MIN, Math.min(cw / worldW, ch / worldH)));

    setZoom(newZoom);
    setPanX(-minX * newZoom + 20);
    setPanY(-minY * newZoom + 20);
  }, [flow]);

  const handleAutoLayout = useCallback(() => {
    if (!flow) return;
    pushUndo(flow);
    const layouted = autoLayoutNodes(flow.nodes, flow.edges);
    setFlow({ ...flow, nodes: layouted });
    toast.success(t("queues_config.toasts.updated_success"));
    setTimeout(handleFitView, 50);
  }, [flow, pushUndo, handleFitView]);

  // ── SAVE ──

  const handleSaveFlow = async () => {
    if (!flow) return;
    setSaving(true);
    try {
      const method = flow.id ? "PUT" : "POST";
      const url = flow.id ? `${API_BASE_URL}/flows/${flow.id}` : `${API_BASE_URL}/flows`;
      const response = await fetch(url, {
        method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify(flow),
      });
      if (!response.ok) throw new Error("Failed to save flow");
      const resData = await response.json();
      const savedFlow = resData.data || resData;
      setFlow(savedFlow);
      toast.success(t("queues_config.toasts.saved_success"));
      if (method === "POST" && savedFlow.id) {
        navigate(`/chatbot/flujos/${savedFlow.id}/editar`, { replace: true });
      }
    } catch (error) {
      console.error("Error saving flow:", error);
      toast.error(t("flow_builder.toast.save_error", "Error al guardar flujo"));
    } finally { setSaving(false); }
  };

  // ── RENDER ──

  if (!flow) return <div className="p-8 text-center">Loading flow...</div>;

  const selectedNode = flow.nodes.find(n => n.id === selectedNodeId);

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-gray-100 dark:bg-reply-bg-dark overflow-hidden transition-colors duration-200">
      <ModuleHeader
        title={t("navigation.flows")}
        description={`${t("common.edit")}: ${flow.name}`}
        icon={<Workflow className="w-8 h-8 text-white" />}
        gradient="from-indigo-600 to-violet-600 dark:from-indigo-800 dark:to-violet-800"
        action={
          <div className="flex gap-3 items-center">
            {stats && (
              <div className="flex items-center gap-2 mr-4 bg-white/10 px-3 py-1 rounded-lg border border-white/20">
                <div className="text-white text-xs font-medium">
                  <span className="opacity-70 text-[10px] uppercase block leading-none">{t("dashboard.total_sessions")}</span>
                  {stats.totalSessions}
                </div>
                <div className="w-px h-6 bg-white/20 mx-1" />
                <div className="text-emerald-300 text-xs font-medium">
                  <span className="opacity-70 text-emerald-200/70 text-[10px] uppercase block leading-none">{t("dashboard.status.active")}</span>
                  {stats.activeSessions}
                </div>
              </div>
            )}
            {undoStack.length > 0 && (
              <span className="text-[10px] text-white/60 font-medium">{undoStack.length} undo{undoStack.length > 1 ? "s" : ""}</span>
            )}
            <button onClick={handleSaveFlow} disabled={saving}
              className="bg-gradient-to-r from-white to-indigo-50 text-indigo-700 px-6 py-2.5 rounded-xl font-black text-sm uppercase tracking-wide hover:shadow-indigo-500/20 hover:shadow-2xl transition-all active:scale-95 shadow-xl border border-white/50 disabled:opacity-50">
              {saving ? t("common.loading") : t("common.save")}
            </button>
          </div>
        }
      />

      <div className="flex-1 flex overflow-hidden relative">
        <FlowSidebar onAddNode={handleAddNode} />

        <FlowCanvas
          nodes={flow.nodes} edges={flow.edges}
          stats={stats}
          selectedNodeId={selectedNodeId} selectedEdgeId={selectedEdgeId}
          connectingNodeId={connectingNodeId} connectingPortLabel={connectingPortLabel}
          zoom={zoom} panX={panX} panY={panY}
          onNodeSelect={(id) => { setSelectedNodeId(id); setSelectedEdgeId(null); }}
          onEdgeSelect={(id) => { setSelectedEdgeId(id); setSelectedNodeId(null); }}
          onNodeDragStart={handleNodeDragStart}
          onCanvasMouseMove={handleCanvasMouseMove}
          onCanvasMouseUp={handleCanvasMouseUp}
          onCanvasClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
          onNodeConnectStart={handleNodeConnectStart}
          onNodeConnectEnd={handleNodeConnectEnd}
          onZoomIn={handleZoomIn} onZoomOut={handleZoomOut}
          onFitView={handleFitView} onAutoLayout={handleAutoLayout}
          onWheel={handleWheel} onPanStart={handlePanStart}
        />

        {selectedNode ? (
          <FlowPropertiesPanel node={selectedNode} onUpdate={updateNodeData} onDelete={handleDeleteNode} />
        ) : selectedEdgeId ? (
          <div className="w-80 bg-white dark:bg-reply-surface-dark border-l border-gray-200 dark:border-reply-border-dark flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-reply-border-dark">
              <h3 className="font-bold text-gray-800 dark:text-white">{t("common.soon")}</h3>
            </div>
            <div className="p-4 space-y-4 flex-1">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t("common.unknown")}: <span className="font-mono text-xs">{selectedEdgeId}</span>
              </p>
              <button onClick={() => { if (flow) { pushUndo(flow); setFlow({...flow, edges: flow.edges.filter(e => e.id !== selectedEdgeId)}); setSelectedEdgeId(null); toast.success(t("queues_config.toasts.deleted_success")); } }}
                className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors border border-red-200 dark:border-red-800/30">
                {t("common.delete")}
              </button>
            </div>
          </div>
        ) : (
          <div className="w-80 bg-white dark:bg-reply-surface-dark border-l border-gray-200 dark:border-reply-border-dark flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-reply-border-dark">
              <h3 className="font-bold text-gray-800 dark:text-white">{t("ai_config.nav.config")}</h3>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t("common.name")}</label>
                <input type="text" value={flow.name} onChange={(e) => setFlow({ ...flow, name: e.target.value })}
                  className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded-lg p-2.5 text-sm text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Trigger Type</label>
                <select value={flow.triggerType}
                  onChange={(e) => setFlow({ ...flow, triggerType: e.target.value as "KEYWORD" | "EVENT" })}
                  className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded-lg p-2.5 text-sm text-gray-800 dark:text-white">
                  <option value="KEYWORD">Keyword (Chatbot)</option>
                  <option value="EVENT">CRM Event (Automations)</option>
                </select>
              </div>
              {flow.triggerType === "KEYWORD" && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Keyword</label>
                  <input type="text" value={flow.triggerConfig?.keyword || ""}
                    onChange={(e) => setFlow({ ...flow, triggerConfig: { ...flow.triggerConfig, keyword: e.target.value } })}
                    className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded-lg p-2.5 text-sm text-gray-800 dark:text-white" placeholder="e.g. hello, pricing" />
                </div>
              )}
              {flow.triggerType === "EVENT" && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Event</label>
                  <select value={flow.triggerConfig?.event || ""}
                    onChange={(e) => setFlow({ ...flow, triggerConfig: { ...flow.triggerConfig, event: e.target.value } })}
                    className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded-lg p-2.5 text-sm text-gray-800 dark:text-white">
                    <option value="">Select Event...</option>
                    <option value="DEAL_CREATED">New Deal Created</option>
                    <option value="DEAL_UPDATED">Deal Updated (Stage Change)</option>
                  </select>
                </div>
              )}

              {/* Keyboard shortcuts help */}
              <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Controles del Lienzo</p>
                <div className="space-y-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                  <div className="flex justify-between"><span>Guardar</span><kbd className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[10px] font-mono">Ctrl+S</kbd></div>
                  <div className="flex justify-between"><span>Deshacer</span><kbd className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[10px] font-mono">Ctrl+Z</kbd></div>
                  <div className="flex justify-between"><span>Eliminar Nodo</span><kbd className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[10px] font-mono">Supr / Backspace</kbd></div>
                  <div className="flex justify-between"><span>Moverse (Pan)</span><span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">Arrastrar el fondo</span></div>
                  <div className="flex justify-between"><span>Zoom</span><span className="text-[10px]">Rueda del mouse</span></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
