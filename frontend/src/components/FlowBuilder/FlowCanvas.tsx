import React, { useRef, useMemo, memo } from "react";
import { FlowNode, FlowConnection, NodeType } from "@/types";

// ==========================================
//  HELPER COMPONENTS (Memoized)
// ==========================================

const getNodeColor = (type: NodeType) => {
  switch (type) {
    case "trigger": return "bg-purple-600 border-purple-400";
    case "send_message": return "bg-blue-600 border-blue-400";
    case "send_image": return "bg-blue-500 border-blue-300";
    case "send_video": return "bg-purple-500 border-purple-300";
    case "send_audio": return "bg-green-500 border-green-300";
    case "send_document": return "bg-gray-500 border-gray-300";
    case "ask_data": return "bg-orange-500 border-orange-300";
    case "condition": return "bg-yellow-600 border-yellow-400";
    case "ai_agent": return "bg-cyan-600 border-cyan-400";
    case "create_deal": return "bg-emerald-600 border-emerald-400";
    case "update_contact": return "bg-indigo-600 border-indigo-400";
    case "assign_agent": return "bg-pink-600 border-pink-400";
    case "ai_handoff": return "bg-red-600 border-red-400";
    case "delay": return "bg-orange-600 border-orange-400";
    case "end": return "bg-gray-600 border-gray-400";
    default: return "bg-gray-600 border-gray-400";
  }
};

const getNodeIcon = (type: NodeType) => {
  switch (type) {
    case "trigger": return "";
    case "send_message": return "[CHAT]";
    case "send_image": return "️";
    case "send_video": return "";
    case "send_audio": return "";
    case "send_document": return "";
    case "ask_data": return "️";
    case "condition": return "";
    case "ai_agent": return "[AI]";
    case "create_deal": return "[BILLING]";
    case "update_contact": return "";
    case "assign_agent": return "";
    case "ai_handoff": return "[SYNC]";
    case "delay": return "⏱️";
    case "end": return "[COMPLETE]";
    default: return "[PKG]";
  }
};

/**
 *  MEMOIZED EDGE COMPONENT
 */
const FlowEdgeComponent = memo(({ edge, sourceNode, targetNode }: { 
  edge: FlowConnection; 
  sourceNode?: FlowNode; 
  targetNode?: FlowNode;
}) => {
  if (!targetNode) return null;

  let startX, startY;
  if (edge.source === "start") {
    startX = 50 + 120;
    startY = 150 + 25;
  } else {
    if (!sourceNode) return null;
    startX = sourceNode.position.x + 200;
    startY = sourceNode.position.y + 40;
  }

  const endX = targetNode.position.x;
  const endY = targetNode.position.y + 40;

  const controlPoint1X = startX + 50;
  const controlPoint1Y = startY;
  const controlPoint2X = endX - 50;
  const controlPoint2Y = endY;

  return (
    <g>
      <path
        d={`M ${startX} ${startY} C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${endX} ${endY}`}
        stroke="#334155"
        strokeWidth="4"
        fill="none"
      />
      <path
        d={`M ${startX} ${startY} C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${endX} ${endY}`}
        stroke="#4ade80"
        strokeWidth="2"
        fill="none"
        strokeDasharray="10,10"
        className="animate-flow-line"
        filter="url(#neon-glow)"
      />
      <circle cx={endX} cy={endY} r="4" fill="#4ade80" filter="url(#neon-glow)" />
    </g>
  );
});

/**
 * [PKG] MEMOIZED NODE COMPONENT
 */
const FlowNodeComponent = memo(({ 
  node, 
  isSelected, 
  isConnecting,
  onSelect, 
  onDragStart, 
  onConnectStart, 
  onConnectEnd 
}: {
  node: FlowNode;
  isSelected: boolean;
  isConnecting: boolean;
  onSelect: (id: string) => void;
  onDragStart: (e: React.MouseEvent, id: string) => void;
  onConnectStart: (e: React.MouseEvent, id: string) => void;
  onConnectEnd: (e: React.MouseEvent, id: string) => void;
}) => (
  <div
    onMouseDown={(e) => onDragStart(e, node.id)}
    onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
    className={`absolute w-[200px] bg-white dark:bg-reply-panel-dark rounded-lg shadow-md border-2 transition-all flow-node z-10 ${
      isSelected ? "ring-2 ring-indigo-500 border-transparent shadow-indigo-200/50" : "border-gray-200 dark:border-gray-600"
    }`}
    style={{ left: node.position.x, top: node.position.y }}
  >
    <div className={`h-2 rounded-t-md w-full ${getNodeColor(node.type)}`}></div>
    <div className="p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{getNodeIcon(node.type)}</span>
        <span className="font-bold text-sm text-gray-800 dark:text-gray-200 truncate">{node.data.label}</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 bg-reply-bg dark:bg-reply-surface-dark p-1.5 rounded">
        {node.data.content || "(Sin contenido)"}
      </p>
    </div>
    <div
      className="absolute left-[-6px] top-[36px] w-4 h-4 bg-white border-2 border-gray-400 rounded-full hover:bg-indigo-500 hover:border-indigo-500 cursor-crosshair transition-colors z-20"
      onMouseUp={(e) => onConnectEnd(e, node.id)}
    ></div>
    <div
      className={`absolute right-[-6px] top-[36px] w-4 h-4 bg-white border-2 border-gray-400 rounded-full hover:bg-indigo-500 hover:border-indigo-500 cursor-crosshair transition-colors z-20 ${isConnecting ? "bg-indigo-500 border-indigo-500" : ""}`}
      onMouseDown={(e) => onConnectStart(e, node.id)}
    ></div>
  </div>
));

// ==========================================
// [BUILD] MAIN CANVAS COMPONENT
// ==========================================

interface FlowCanvasProps {
  nodes: FlowNode[];
  edges: FlowConnection[];
  selectedNodeId: string | null;
  connectingNodeId: string | null;
  onNodeSelect: (id: string) => void;
  onNodeDragStart: (e: React.MouseEvent, id: string) => void;
  onCanvasMouseMove: (e: React.MouseEvent) => void;
  onCanvasMouseUp: () => void;
  onCanvasClick: () => void;
  onNodeConnectStart: (e: React.MouseEvent, id: string) => void;
  onNodeConnectEnd: (e: React.MouseEvent, id: string) => void;
}

export const FlowCanvas: React.FC<FlowCanvasProps> = ({
  nodes,
  edges,
  selectedNodeId,
  connectingNodeId,
  onNodeSelect,
  onNodeDragStart,
  onCanvasMouseMove,
  onCanvasMouseUp,
  onCanvasClick,
  onNodeConnectStart,
  onNodeConnectEnd,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    onCanvasMouseMove(e);
    if (connectingNodeId) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    }
  };

  // Optimization: Pre-calculate startX/Y only once when connectingNodeId changes
  const tempLineStart = useMemo(() => {
    if (!connectingNodeId) return null;
    if (connectingNodeId === "start") return { x: 50 + 120, y: 150 + 25 };
    const source = nodes.find((n) => n.id === connectingNodeId);
    if (!source) return null;
    return { x: source.position.x + 200, y: source.position.y + 40 };
  }, [connectingNodeId, nodes]);

  return (
    <div
      className="flex-1 bg-reply-bg dark:bg-reply-surface-dark relative overflow-hidden cursor-grab active:cursor-grabbing"
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      onMouseUp={onCanvasMouseUp}
      onClick={onCanvasClick}
      style={{
        backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
        <defs>
          <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Permanent Edges */}
        {edges.map((edge) => (
          <FlowEdgeComponent
            key={edge.id}
            edge={edge}
            sourceNode={nodes.find(n => n.id === edge.source)}
            targetNode={nodes.find(n => n.id === edge.target)}
          />
        ))}

        {/* Temporary Connection Line */}
        {tempLineStart && (
          <line
            x1={tempLineStart.x}
            y1={tempLineStart.y}
            x2={mousePos.x}
            y2={mousePos.y}
            stroke="#6366f1"
            strokeWidth="3"
            strokeDasharray="5,5"
          />
        )}
      </svg>

      {/* START NODE */}
      <div
        className="absolute w-[120px] bg-green-500 rounded-full shadow-md border-2 border-green-600 flex items-center justify-center z-10 mx-auto"
        style={{ left: 50, top: 150, height: 50 }}
      >
        <span className="font-bold text-white"> INICIO</span>
        <div
          className={`absolute right-[-6px] top-[20px] w-4 h-4 bg-white border-2 border-gray-400 rounded-full hover:bg-indigo-500 hover:border-indigo-500 cursor-crosshair transition-colors ${connectingNodeId === "start" ? "bg-indigo-500 border-indigo-500" : ""}`}
          onMouseDown={(e) => onNodeConnectStart(e, "start")}
        ></div>
      </div>

      {/* USER NODES */}
      {nodes.map((node) => (
        <FlowNodeComponent
          key={node.id}
          node={node}
          isSelected={selectedNodeId === node.id}
          isConnecting={connectingNodeId === node.id}
          onSelect={onNodeSelect}
          onDragStart={onNodeDragStart}
          onConnectStart={onNodeConnectStart}
          onConnectEnd={onNodeConnectEnd}
        />
      ))}
    </div>
  );
};


