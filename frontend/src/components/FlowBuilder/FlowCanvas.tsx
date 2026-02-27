import React, { useRef } from "react";
import { FlowNode, FlowConnection, NodeType } from "@/types";

interface FlowCanvasProps {
  nodes: FlowNode[];
  edges: FlowConnection[];
  selectedNodeId: string | null;
  onNodeSelect: (id: string) => void;
  onNodeDragStart: (e: React.MouseEvent, id: string) => void;
  onCanvasMouseMove: (e: React.MouseEvent) => void;
  onCanvasMouseUp: () => void;
  onCanvasClick: () => void;
  connectingNodeId: string | null;
  onNodeConnectStart: (e: React.MouseEvent, id: string) => void;
  onNodeConnectEnd: (e: React.MouseEvent, id: string) => void;
}

export const FlowCanvas: React.FC<FlowCanvasProps> = ({
  nodes,
  edges,
  selectedNodeId,
  onNodeSelect,
  onNodeDragStart,
  onCanvasMouseMove,
  onCanvasMouseUp,
  onCanvasClick,
  connectingNodeId,
  onNodeConnectStart,
  onNodeConnectEnd,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);

  const getNodeColor = (type: NodeType) => {
    switch (type) {
      // Inicio
      case "trigger":
        return "bg-purple-600 border-purple-400";

      // Mensajes
      case "send_message":
        return "bg-blue-600 border-blue-400";
      case "send_image":
        return "bg-blue-500 border-blue-300";
      case "send_video":
        return "bg-purple-500 border-purple-300";
      case "send_audio":
        return "bg-green-500 border-green-300";
      case "send_document":
        return "bg-gray-500 border-gray-300";

      // Interacción
      case "ask_data":
        return "bg-orange-500 border-orange-300";
      case "condition":
        return "bg-yellow-600 border-yellow-400";
      case "ai_agent":
        return "bg-cyan-600 border-cyan-400";

      // CRM
      case "create_deal":
        return "bg-emerald-600 border-emerald-400";
      case "update_contact":
        return "bg-indigo-600 border-indigo-400";

      // Asignación
      case "assign_agent":
        return "bg-pink-600 border-pink-400";
      case "ai_handoff":
        return "bg-red-600 border-red-400";

      // Control
      case "delay":
        return "bg-orange-600 border-orange-400";
      case "end":
        return "bg-gray-600 border-gray-400";

      // Legacy (deprecated)
      case "message":
        return "bg-blue-600 border-blue-400";
      case "input":
        return "bg-orange-500 border-orange-300";

      case "action_email":
        return "bg-pink-600 border-pink-400";
      case "action_task":
        return "bg-indigo-600 border-indigo-400";
      case "action_calendar":
        return "bg-red-600 border-red-400";

      default:
        return "bg-gray-600 border-gray-400";
    }
  };

  const getNodeIcon = (type: NodeType) => {
    switch (type) {
      // Inicio
      case "trigger":
        return "⚡";

      // Mensajes
      case "send_message":
        return "💬";
      case "send_image":
        return "🖼️";
      case "send_video":
        return "🎥";
      case "send_audio":
        return "🎵";
      case "send_document":
        return "📄";

      // Interacción
      case "ask_data":
        return "✍️";
      case "condition":
        return "❓";
      case "ai_agent":
        return "🤖";

      // CRM
      case "create_deal":
        return "💰";
      case "update_contact":
        return "👤";

      // Asignación
      case "assign_agent":
        return "🎯";
      case "ai_handoff":
        return "🔄";

      // Control
      case "delay":
        return "⏱️";
      case "end":
        return "🏁";

      // Legacy (deprecated)
      case "message":
        return "💬";
      case "input":
        return "✍️";

      case "action_email":
        return "📧";
      case "action_task":
        return "📝";
      case "action_calendar":
        return "📅";

      default:
        return "📦"; // Icono de paquíete en lugar de texto
    }
  };

  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    onCanvasMouseMove(e);
    if (connectingNodeId) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        setMousePos({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      }
    }
  };

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
      {/* SVG CONNECTIONS LAYER */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
        {/* Glow Filter Definition */}
        <defs>
          <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Temporary Connection Line */}
        {connectingNodeId &&
          (() => {
            let startX, startY;

            if (connectingNodeId === "start") {
              startX = 50 + 120; // Left + Width
              startY = 150 + 25; // Top + Half Height
            } else {
              const source = nodes.find((n) => n.id === connectingNodeId);
              if (!source) return null;
              startX = source.position.x + 200;
              startY = source.position.y + 40;
            }

            return (
              <line
                x1={startX}
                y1={startY}
                x2={mousePos.x}
                y2={mousePos.y}
                stroke="#6366f1"
                strokeWidth="3"
                strokeDasharray="5,5"
              />
            );
          })()}

        {edges.map((edge) => {
          let startX, startY;

          if (edge.source === "start") {
            startX = 50 + 120;
            startY = 150 + 25;
          } else {
            const source = nodes.find((n) => n.id === edge.source);
            if (!source) return null; // Skip if source node deleted
            startX = source.position.x + 200;
            startY = source.position.y + 40;
          }

          const target = nodes.find((n) => n.id === edge.target);
          if (!target) return null;

          // Calculate path
          const endX = target.position.x;
          const endY = target.position.y + 40;

          // Bezier Curve
          const controlPoint1X = startX + 50;
          const controlPoint1Y = startY;
          const controlPoint2X = endX - 50;
          const controlPoint2Y = endY;

          return (
            <g key={edge.id}>
              {/* Base Grey Path */}
              <path
                d={`M ${startX} ${startY} C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${endX} ${endY}`}
                stroke="#334155"
                strokeWidth="4"
                fill="none"
              />

              {/* Animated Neon Path */}
              <path
                d={`M ${startX} ${startY} C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${endX} ${endY}`}
                stroke="#4ade80"
                strokeWidth="2"
                fill="none"
                strokeDasharray="10,10"
                className="animate-flow-line"
                filter="url(#neon-glow)"
              />

              <circle
                cx={endX}
                cy={endY}
                r="4"
                fill="#4ade80"
                filter="url(#neon-glow)"
              />
            </g>
          );
        })}
      </svg>

      {/* NODES LAYER */}
      {/* START NODE (Visual Only) */}
      <div
        className="absolute w-[120px] bg-green-500 rounded-full shadow-md border-2 border-green-600 flex items-center justify-center z-10"
        style={{ left: 50, top: 150, height: 50 }}
      >
        <span className="font-bold text-white">🚀 INICIO</span>
        {/* Output Handle */}
        <div
          className={`absolute right-[-6px] top-[20px] w-4 h-4 bg-white border-2 border-gray-400 rounded-full hover:bg-indigo-500 hover:border-indigo-500 cursor-crosshair transition-colors ${connectingNodeId === "start" ? "bg-indigo-500 border-indigo-500" : ""}`}
          onMouseDown={(e) => onNodeConnectStart(e, "start")}
        ></div>
      </div>

      {nodes.map((node) => (
        <div
          key={node.id}
          onMouseDown={(e) => onNodeDragStart(e, node.id)}
          onClick={(e) => {
            e.stopPropagation();
            onNodeSelect(node.id);
          }}
          className={`absolute w-[200px] bg-white dark:bg-reply-panel-dark rounded-lg shadow-md border-2 transition-all flow-node z-10 ${
            selectedNodeId === node.id
              ? "ring-2 ring-indigo-500 border-transparent"
              : "border-gray-200 dark:border-gray-600"
          }`}
          style={{ left: node.position.x, top: node.position.y }}
        >
          {/* Header */}
          <div
            className={`h-2 rounded-t-md w-full ${getNodeColor(node.type)}`}
          ></div>

          <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{getNodeIcon(node.type)}</span>
              <span className="font-bold text-sm text-gray-800 dark:text-gray-200 truncate">
                {node.data.label}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 bg-reply-bg dark:bg-reply-surface-dark p-1.5 rounded">
              {node.data.content || "(Sin contenido)"}
            </p>
          </div>

          {/* Handles */}
          {/* INPUT HANDLE (Left) */}
          <div
            className="absolute left-[-6px] top-[36px] w-4 h-4 bg-white border-2 border-gray-400 rounded-full hover:bg-indigo-500 hover:border-indigo-500 cursor-crosshair transition-colors z-20"
            onMouseUp={(e) => onNodeConnectEnd(e, node.id)}
          ></div>

          {/* OUTPUT HANDLE (Right) */}
          <div
            className={`absolute right-[-6px] top-[36px] w-4 h-4 bg-white border-2 border-gray-400 rounded-full hover:bg-indigo-500 hover:border-indigo-500 cursor-crosshair transition-colors z-20 ${connectingNodeId === node.id ? "bg-indigo-500 border-indigo-500" : ""}`}
            onMouseDown={(e) => onNodeConnectStart(e, node.id)}
          ></div>
        </div>
      ))}
    </div>
  );
};


