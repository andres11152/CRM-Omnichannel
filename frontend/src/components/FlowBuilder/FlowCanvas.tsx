import React, { useRef, useMemo, memo, useState, useCallback } from "react";
import { FlowNode, FlowConnection } from "@/types";
import { Play, ZoomIn, ZoomOut, Maximize2, LayoutGrid } from "lucide-react";
import { NODE_REGISTRY, getNodePreview } from "./nodes/FlowNodeRegistry";
import { useTranslation } from "react-i18next";

// ==========================================
//  EDGE COMPONENT (Memoized + Selectable)
// ==========================================

const FlowEdgeComponent = memo(({ edge, sourceNode, targetNode, isSelected, onSelect }: {
  edge: FlowConnection;
  sourceNode?: FlowNode;
  targetNode?: FlowNode;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) => {
  if (!targetNode) return null;

  let startX: number, startY: number;
  if (edge.source === "start") {
    startX = 50 + 160;
    startY = 150 + 30;
  } else {
    if (!sourceNode) return null;
    startX = sourceNode.position.x + 220;
    if (edge.label === "TRUE") startY = sourceNode.position.y + 40;
    else if (edge.label === "FALSE") startY = sourceNode.position.y + 70;
    else startY = sourceNode.position.y + 55;
  }

  const endX = targetNode.position.x;
  const endY = targetNode.position.y + 55;
  const dx = Math.abs(endX - startX);
  const cpOffset = Math.max(50, dx * 0.4);
  const pathD = `M ${startX} ${startY} C ${startX + cpOffset} ${startY}, ${endX - cpOffset} ${endY}, ${endX} ${endY}`;
  const edgeColor = edge.label === "TRUE" ? "#10b981" : edge.label === "FALSE" ? "#ef4444" : "#818cf8";

  return (
    <g>
      <path d={pathD} stroke="#334155" strokeWidth="4" fill="none" opacity="0.3" />
      <path d={pathD} stroke={isSelected ? "#f59e0b" : edgeColor} strokeWidth={isSelected ? "3" : "2"} fill="none" filter="url(#neon-glow)" />
      {/* Invisible fat hitbox for click */}
      <path d={pathD} stroke="transparent" strokeWidth="16" fill="none" style={{ cursor: "pointer", pointerEvents: "stroke" }}
        onClick={(e) => { e.stopPropagation(); onSelect(edge.id); }} />
      {edge.label && (
        <foreignObject x={(startX + endX) / 2 - 18} y={(startY + endY) / 2 - 10} width="36" height="20">
          <div className={`text-[8px] font-black rounded-full flex items-center justify-center text-white shadow-lg h-full ${edge.label === "TRUE" ? "bg-emerald-500" : "bg-red-500"}`}>
            {edge.label === "TRUE" ? "YES" : "NO"}
          </div>
        </foreignObject>
      )}
      <circle cx={endX} cy={endY} r="4" fill={isSelected ? "#f59e0b" : edgeColor} filter="url(#neon-glow)" />
    </g>
  );
});

// ==========================================
//  NODE COMPONENT (Memoized, Registry-based)
// ==========================================

const FlowNodeComponent = memo(({
  node, isSelected, isConnecting, executionCount = 0, onSelect, onDragStart, onConnectStart, onConnectEnd
}: {
  node: FlowNode; isSelected: boolean; isConnecting: boolean; executionCount?: number;
  onSelect: (id: string) => void;
  onDragStart: (e: React.MouseEvent, id: string) => void;
  onConnectStart: (e: React.MouseEvent, id: string, label?: string) => void;
  onConnectEnd: (e: React.MouseEvent, id: string) => void;
}) => {
  const { t } = useTranslation();
  const config = NODE_REGISTRY[node.type];
  const preview = getNodePreview(node.type, node.data as Record<string, unknown>);

  return (
    <div
      onMouseDown={(e) => onDragStart(e, node.id)}
      onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
      className={`absolute w-[220px] bg-white dark:bg-reply-panel-dark rounded-2xl shadow-lg border-2 transition-all duration-200 flow-node z-10 hover:shadow-xl hover:-translate-y-0.5 ${
        isSelected ? "ring-4 ring-indigo-500/30 border-indigo-500 shadow-indigo-500/20 scale-[1.02]" : `border-gray-200 dark:border-gray-700/80 ${config?.borderColor || ""}`
      }`}
      style={{ left: node.position.x, top: node.position.y }}
    >
      <div className={`h-1.5 rounded-t-2xl w-full ${config?.color || "bg-gray-500"}`} />
      <div className="p-3.5">
        <div className="flex items-center gap-2.5 mb-2">
          <div className={`w-8 h-8 rounded-lg ${config?.color || "bg-gray-500"} flex items-center justify-center text-white shadow-sm flex-shrink-0`}>
            {config?.icon}
          </div>
          <div className="min-w-0 flex-1">
            <span className="font-bold text-[13px] text-gray-900 dark:text-gray-100 truncate block leading-tight">{node.data.label || t(config?.label || "")}</span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider">{t(config?.label || "")}</span>
          </div>
        </div>
        {preview && (
          <div className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-100 dark:border-gray-800">{preview}</div>
        )}
      </div>

      {/* Input Port */}
      <div className="absolute left-[-10px] top-[45px] w-5 h-5 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-full hover:bg-indigo-500 hover:border-indigo-500 cursor-crosshair transition-all z-20 group"
        onMouseUp={(e) => onConnectEnd(e, node.id)}>
        <div className="absolute inset-1 rounded-full bg-gray-200 dark:bg-gray-700 group-hover:bg-white transition-colors" />
      </div>

      {/* Output Ports */}
      {config?.hasTruePort && config?.hasFalsePort ? (
        <>
          <div className="absolute right-[-10px] top-[30px] w-5 h-5 bg-white dark:bg-gray-800 border-2 border-emerald-500 rounded-full hover:bg-emerald-500 cursor-crosshair transition-all z-20 group"
            onMouseDown={(e) => onConnectStart(e, node.id, "TRUE")}>
            <div className="absolute inset-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 group-hover:bg-white transition-colors" />
            <span className="absolute right-6 top-[-2px] text-[9px] font-black text-emerald-600 uppercase select-none">YES</span>
          </div>
          <div className="absolute right-[-10px] top-[60px] w-5 h-5 bg-white dark:bg-gray-800 border-2 border-red-500 rounded-full hover:bg-red-500 cursor-crosshair transition-all z-20 group"
            onMouseDown={(e) => onConnectStart(e, node.id, "FALSE")}>
            <div className="absolute inset-1 rounded-full bg-red-100 dark:bg-red-900/30 group-hover:bg-white transition-colors" />
            <span className="absolute right-6 top-[-2px] text-[9px] font-black text-red-600 uppercase select-none">NO</span>
          </div>
        </>
      ) : config?.hasOutputPort ? (
        <div className={`absolute right-[-10px] top-[45px] w-5 h-5 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-full hover:bg-indigo-500 hover:border-indigo-500 cursor-crosshair transition-all z-20 group ${isConnecting ? "bg-indigo-500 border-indigo-500" : ""}`}
          onMouseDown={(e) => onConnectStart(e, node.id)}>
          <div className="absolute inset-1 rounded-full bg-gray-200 dark:bg-gray-700 group-hover:bg-white transition-colors" />
        </div>
      ) : null}

      {config?.isTerminal && (
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-red-500 border-2 border-white dark:border-gray-800 shadow-sm" />
      )}

      {/* Execution Count Badge */}
      {executionCount > 0 && (
        <div className="absolute -top-2 -right-2 bg-indigo-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg border-2 border-white dark:border-gray-800 z-30" title={`${executionCount} executions`}>
          {executionCount}
        </div>
      )}
    </div>
  );
});

// ==========================================
//  MINIMAP COMPONENT
// ==========================================

const Minimap: React.FC<{ nodes: FlowNode[]; zoom: number; panX: number; panY: number; canvasW: number; canvasH: number }> = memo(
  ({ nodes, zoom, panX, panY, canvasW, canvasH }) => {
    if (nodes.length === 0) return null;
    const MINI_W = 160, MINI_H = 100;
    const allX = [50, ...nodes.map(n => n.position.x)];
    const allY = [150, ...nodes.map(n => n.position.y)];
    const minX = Math.min(...allX) - 40, maxX = Math.max(...allX) + 260;
    const minY = Math.min(...allY) - 40, maxY = Math.max(...allY) + 140;
    const worldW = maxX - minX || 1, worldH = maxY - minY || 1;
    const scale = Math.min(MINI_W / worldW, MINI_H / worldH);

    const vpW = (canvasW / zoom) * scale;
    const vpH = (canvasH / zoom) * scale;
    const vpX = (-panX / zoom - minX) * scale;
    const vpY = (-panY / zoom - minY) * scale;

    return (
      <div className="absolute bottom-14 right-4 z-30 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-1.5 select-none" style={{ width: MINI_W + 12, height: MINI_H + 12 }}>
        <svg width={MINI_W} height={MINI_H} className="block">
          {/* Start node */}
          <rect x={(50 - minX) * scale} y={(150 - minX) * scale} width={160 * scale} height={60 * scale} rx={30 * scale} fill="#10b981" opacity="0.7" />
          {nodes.map(n => {
            const cfg = NODE_REGISTRY[n.type];
            const color = cfg?.color?.replace("bg-", "").split("-")[0] || "gray";
            const colorMap: Record<string, string> = { blue: "#3b82f6", violet: "#8b5cf6", pink: "#ec4899", amber: "#f59e0b", orange: "#f97316", cyan: "#06b6d4", yellow: "#eab308", purple: "#a855f7", green: "#22c55e", teal: "#14b8a6", indigo: "#6366f1", rose: "#f43f5e", lime: "#84cc16", emerald: "#10b981", slate: "#64748b", gray: "#6b7280", red: "#ef4444", sky: "#0ea5e9" };
            return (
              <rect key={n.id} x={(n.position.x - minX) * scale} y={(n.position.y - minY) * scale}
                width={220 * scale} height={90 * scale} rx={4 * scale}
                fill={colorMap[color] || "#6b7280"} opacity="0.6" />
            );
          })}
          {/* Viewport rect */}
          <rect x={vpX} y={vpY} width={vpW} height={vpH} fill="none" stroke="#6366f1" strokeWidth="1.5" rx="2" opacity="0.8" />
        </svg>
      </div>
    );
  }
);

// ==========================================
//  CANVAS TOOLBAR
// ==========================================

const CanvasToolbar: React.FC<{
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onAutoLayout: () => void;
}> = ({ zoom, onZoomIn, onZoomOut, onFitView, onAutoLayout }) => (
  <div className="absolute top-4 right-4 z-30 flex flex-col gap-1.5 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-1.5">
    <button onClick={onZoomIn} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors" title="Zoom In">
      <ZoomIn size={16} />
    </button>
    <div className="text-[9px] font-bold text-center text-gray-400">{Math.round(zoom * 100)}%</div>
    <button onClick={onZoomOut} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors" title="Zoom Out">
      <ZoomOut size={16} />
    </button>
    <div className="w-6 h-px bg-gray-200 dark:bg-gray-700 mx-auto" />
    <button onClick={onFitView} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors" title="Fit View">
      <Maximize2 size={16} />
    </button>
    <button onClick={onAutoLayout} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors" title="Auto Layout">
      <LayoutGrid size={16} />
    </button>
  </div>
);

// ==========================================
//  MAIN CANVAS COMPONENT
// ==========================================

interface FlowCanvasProps {
  nodes: FlowNode[];
  edges: FlowConnection[];
  stats?: { totalSessions: number; activeSessions: number; completedSessions: number; nodeStats: Record<string, number> } | null;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  connectingNodeId: string | null;
  connectingPortLabel: string | null;
  zoom: number;
  panX: number;
  panY: number;
  onNodeSelect: (id: string) => void;
  onEdgeSelect: (id: string | null) => void;
  onNodeDragStart: (e: React.MouseEvent, id: string) => void;
  onCanvasMouseMove: (e: React.MouseEvent) => void;
  onCanvasMouseUp: () => void;
  onCanvasClick: () => void;
  onNodeConnectStart: (e: React.MouseEvent, id: string, label?: string) => void;
  onNodeConnectEnd: (e: React.MouseEvent, id: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onAutoLayout: () => void;
  onWheel: (e: React.WheelEvent) => void;
  onPanStart: (e: React.MouseEvent) => void;
}

export const FlowCanvas: React.FC<FlowCanvasProps> = ({
  nodes, edges, stats, selectedNodeId, selectedEdgeId, connectingNodeId, connectingPortLabel,
  zoom, panX, panY,
  onNodeSelect, onEdgeSelect, onNodeDragStart,
  onCanvasMouseMove, onCanvasMouseUp, onCanvasClick,
  onNodeConnectStart, onNodeConnectEnd,
  onZoomIn, onZoomOut, onFitView, onAutoLayout, onWheel, onPanStart,
}) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    onCanvasMouseMove(e);
    if (connectingNodeId && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setMousePos({ x: (e.clientX - rect.left - panX) / zoom, y: (e.clientY - rect.top - panY) / zoom });
    }
  }, [onCanvasMouseMove, connectingNodeId, panX, panY, zoom]);

  const tempLineStart = useMemo(() => {
    if (!connectingNodeId) return null;
    if (connectingNodeId === "start") return { x: 50 + 160, y: 150 + 30 };
    const source = nodes.find((n) => n.id === connectingNodeId);
    if (!source) return null;
    let offset = 55;
    if (connectingPortLabel === "TRUE") offset = 40;
    if (connectingPortLabel === "FALSE") offset = 70;
    return { x: source.position.x + 220, y: source.position.y + offset };
  }, [connectingNodeId, nodes, connectingPortLabel]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".flow-node") || (e.target as HTMLElement).tagName === "path") return;
    onEdgeSelect(null);
    onCanvasClick();
  }, [onCanvasClick, onEdgeSelect]);

  const canvasWidth = canvasRef.current?.clientWidth || 900;
  const canvasHeight = canvasRef.current?.clientHeight || 600;

  return (
    <div
      className="flex-1 bg-gray-50 dark:bg-reply-surface-dark relative overflow-hidden select-none cursor-grab active:cursor-grabbing"
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      onMouseUp={onCanvasMouseUp}
      onClick={handleCanvasClick}
      onWheel={onWheel}
      onMouseDown={onPanStart}
      style={{ backgroundImage: "radial-gradient(circle, #d1d5db 1px, transparent 1px)", backgroundSize: `${24 * zoom}px ${24 * zoom}px`, backgroundPosition: `${panX}px ${panY}px` }}
    >
      {/* Transform layer */}
      <div style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})`, transformOrigin: "0 0", willChange: "transform" }}>
        {/* SVG edges */}
        <svg className="absolute inset-0 pointer-events-none z-0 overflow-visible" style={{ width: 9999, height: 9999 }}>
          <defs>
            <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {edges.map((edge) => (
            <FlowEdgeComponent key={edge.id} edge={edge}
              sourceNode={nodes.find(n => n.id === edge.source)}
              targetNode={nodes.find(n => n.id === edge.target)}
              isSelected={selectedEdgeId === edge.id}
              onSelect={onEdgeSelect} />
          ))}
          {tempLineStart && (
            <line x1={tempLineStart.x} y1={tempLineStart.y} x2={mousePos.x} y2={mousePos.y}
              stroke="#6366f1" strokeWidth="2.5" strokeDasharray="6,4" opacity="0.7" />
          )}
        </svg>

        {/* START NODE */}
        <div className="absolute w-[160px] bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full shadow-2xl border-4 border-white dark:border-gray-800 flex items-center justify-center z-10 transition-transform hover:scale-105"
          style={{ left: 50, top: 150, height: 60 }}>
          <div className="flex items-center gap-2">
            <Play size={20} fill="white" className="text-white" />
            <span className="font-black text-white tracking-wider text-sm">{t("flow_builder.nodes.trigger.label").toUpperCase()}</span>
          </div>
          <div className={`absolute right-[-10px] top-[20px] w-6 h-6 bg-white dark:bg-gray-800 border-3 border-emerald-500 rounded-full hover:bg-indigo-500 hover:border-indigo-500 cursor-crosshair shadow-lg transition-all ${connectingNodeId === "start" ? "bg-indigo-500 border-indigo-500" : ""}`}
            onMouseDown={(e) => onNodeConnectStart(e, "start")}>
            <div className="absolute inset-1 rounded-full bg-emerald-50 animate-pulse" />
          </div>
          {/* Start Node Execution Count Badge */}
          {stats?.nodeStats?.["start"] ? (
            <div className="absolute -top-2 -right-2 bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg border-2 border-white dark:border-gray-800 z-30" title={`${stats.nodeStats["start"]} executions`}>
              {stats.nodeStats["start"]}
            </div>
          ) : null}
        </div>

        {/* USER NODES */}
        {nodes.map((node) => (
          <FlowNodeComponent key={node.id} node={node}
            isSelected={selectedNodeId === node.id} isConnecting={connectingNodeId === node.id}
            executionCount={stats?.nodeStats?.[node.id] || 0}
            onSelect={onNodeSelect} onDragStart={onNodeDragStart}
            onConnectStart={onNodeConnectStart} onConnectEnd={onNodeConnectEnd} />
        ))}
      </div>

      {/* HUD (outside transform) */}
      <CanvasToolbar zoom={zoom} onZoomIn={onZoomIn} onZoomOut={onZoomOut} onFitView={onFitView} onAutoLayout={onAutoLayout} />
      <Minimap nodes={nodes} zoom={zoom} panX={panX} panY={panY} canvasW={canvasWidth} canvasH={canvasHeight} />

      <div className="absolute bottom-4 left-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg px-3 py-1.5 text-[10px] font-medium text-gray-400 dark:text-gray-500 shadow-sm border border-gray-200 dark:border-gray-700 z-20">
        {nodes.length} {t("flow_builder.builder.nodes_count", { defaultValue: "nodes" })} &middot; {edges.length} {t("flow_builder.builder.connections_count", { defaultValue: "connections" })} &middot; {t("flow_builder.builder.canvas_hint", { defaultValue: "Scroll to zoom · Middle-click to pan" })}
      </div>
    </div>
  );
};
