
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { NodeType } from '../../types';

interface FlowSidebarProps {
  onAddNode: (type: NodeType) => void;
}

interface TooltipData {
  label: string;
  description: string;
}

export const FlowSidebar: React.FC<FlowSidebarProps> = ({ onAddNode }) => {
  const [activeTooltip, setActiveTooltip] = useState<{ id: string; position: { x: number; y: number } } | null>(null);

  return (
    <div className="w-16 bg-white dark:bg-[#202c33] border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-4 gap-3 z-10 shadow-sm overflow-y-auto">
      {/* Mensajes */}
      <TooltipTool 
        id="send_message"
        onClick={() => onAddNode('send_message')} 
        icon="💬" 
        label="Enviar Mensaje" 
        description="Envía un mensaje de texto al usuario y continúa automáticamente"
        activeTooltip={activeTooltip}
        setActiveTooltip={setActiveTooltip}
      />
      <TooltipTool 
        id="send_image"
        onClick={() => onAddNode('send_image')} 
        icon="🖼️" 
        label="Enviar Imagen" 
        description="Envía una imagen por WhatsApp y avanza al siguiente paso"
        activeTooltip={activeTooltip}
        setActiveTooltip={setActiveTooltip}
      />
      <TooltipTool 
        id="send_video"
        onClick={() => onAddNode('send_video')} 
        icon="🎥" 
        label="Enviar Video" 
        description="Envía un video al usuario automáticamente"
        activeTooltip={activeTooltip}
        setActiveTooltip={setActiveTooltip}
      />
      <TooltipTool 
        id="send_audio"
        onClick={() => onAddNode('send_audio')} 
        icon="🎵" 
        label="Enviar Audio" 
        description="Envía un archivo de audio o nota de voz"
        activeTooltip={activeTooltip}
        setActiveTooltip={setActiveTooltip}
      />
      <TooltipTool 
        id="send_document"
        onClick={() => onAddNode('send_document')} 
        icon="📄" 
        label="Enviar Documento" 
        description="Envía un archivo PDF, Word u otro documento"
        activeTooltip={activeTooltip}
        setActiveTooltip={setActiveTooltip}
      />
      
      <div className="w-8 h-[1px] bg-gray-300 dark:bg-gray-600 my-1"></div>
      
      {/* Interacción */}
      <TooltipTool 
        id="ask_data"
        onClick={() => onAddNode('ask_data')} 
        icon="✍️" 
        label="Solicitar Datos" 
        description="PAUSA el flujo, hace una pregunta y espera la respuesta del usuario"
        activeTooltip={activeTooltip}
        setActiveTooltip={setActiveTooltip}
      />
      <TooltipTool 
        id="condition"
        onClick={() => onAddNode('condition')} 
        icon="❓" 
        label="Condición" 
        description="Evalúa una condición y ramifica el flujo según la respuesta"
        activeTooltip={activeTooltip}
        setActiveTooltip={setActiveTooltip}
      />
      <TooltipTool 
        id="ai_agent"
        onClick={() => onAddNode('ai_agent')} 
        icon="🤖" 
        label="Agente IA" 
        description="Responde usando inteligencia artificial (OpenAI/Gemini)"
        activeTooltip={activeTooltip}
        setActiveTooltip={setActiveTooltip}
      />
      
      <div className="w-8 h-[1px] bg-gray-300 dark:bg-gray-600 my-1"></div>
      
      {/* Acciones CRM */}
      <TooltipTool 
        id="create_deal"
        onClick={() => onAddNode('create_deal')} 
        icon="💰" 
        label="Crear Deal" 
        description="Crea un nuevo deal automáticamente en el CRM"
        activeTooltip={activeTooltip}
        setActiveTooltip={setActiveTooltip}
      />
      <TooltipTool 
        id="update_contact"
        onClick={() => onAddNode('update_contact')} 
        icon="👤" 
        label="Actualizar Contacto" 
        description="Actualiza los campos del contacto con datos capturados"
        activeTooltip={activeTooltip}
        setActiveTooltip={setActiveTooltip}
      />
      
      <div className="w-8 h-[1px] bg-gray-300 dark:bg-gray-600 my-1"></div>
      
      {/* Asignación */}
      <TooltipTool 
        id="assign_agent"
        onClick={() => onAddNode('assign_agent')} 
        icon="🎯" 
        label="Asignar Agente" 
        description="Asigna la conversación a un agente humano específico"
        activeTooltip={activeTooltip}
        setActiveTooltip={setActiveTooltip}
      />
      <TooltipTool 
        id="ai_handoff"
        onClick={() => onAddNode('ai_handoff')} 
        icon="🔄" 
        label="Transferir a Humano" 
        description="Finaliza el bot y transfiere el caso a un agente humano"
        activeTooltip={activeTooltip}
        setActiveTooltip={setActiveTooltip}
      />
      
      <div className="w-8 h-[1px] bg-gray-300 dark:bg-gray-600 my-1"></div>
      
      {/* Control de Flujo */}
      <TooltipTool 
        id="delay"
        onClick={() => onAddNode('delay')} 
        icon="⏱️" 
        label="Delay / Espera" 
        description="Espera X minutos/horas antes de continuar el flujo"
        activeTooltip={activeTooltip}
        setActiveTooltip={setActiveTooltip}
      />
      <TooltipTool 
        id="end"
        onClick={() => onAddNode('end')} 
        icon="🏁" 
        label="Fin del Flujo" 
        description="Termina el flujo de automatización"
        activeTooltip={activeTooltip}
        setActiveTooltip={setActiveTooltip}
      />
    </div>
  );
};

const TooltipTool: React.FC<{
  id: string;
  onClick: () => void;
  icon: string;
  label: string;
  description: string;
  activeTooltip: { id: string; position: { x: number; y: number } } | null;
  setActiveTooltip: (tooltip: { id: string; position: { x: number; y: number } } | null) => void;
}> = ({id, onClick, icon, label, description, activeTooltip, setActiveTooltip}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleMouseEnter = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setActiveTooltip({
        id,
        position: {
          x: rect.right + 8, // 8px a la derecha del botón
          y: rect.top + rect.height / 2 // Centro vertical del botón
        }
      });
    }
  };

  const handleMouseLeave = () => {
    setActiveTooltip(null);
  };

  const isActive = activeTooltip?.id === id;

  return (
    <>
      <button 
        ref={buttonRef}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        title={`${label}: ${description}`}
        className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center text-xl hover:bg-gray-200 dark:hover:bg-gray-600 hover:scale-110 transition-all shadow-sm"
      >
        {icon}
      </button>
      
      {/* Tooltip usando Portal - renderizado en body */}
      {isActive && activeTooltip && createPortal(
        <div 
          className="fixed bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-2xl min-w-[200px] max-w-[250px] whitespace-normal pointer-events-none"
          style={{
            left: `${activeTooltip.position.x}px`,
            top: `${activeTooltip.position.y}px`,
            transform: 'translateY(-50%)',
            zIndex: 2147483647 // Z-INDEX MÁXIMO ABSOLUTO (max int32)
          }}
        >
          <div className="font-bold mb-1 text-white">{label}</div>
          <div className="text-gray-300 text-[11px] leading-tight">{description}</div>
          {/* Flecha */}
          <div 
            className="absolute w-0 h-0" 
            style={{
              left: '-6px',
              top: '50%',
              transform: 'translateY(-50%)',
              borderTop: '6px solid transparent',
              borderRight: '6px solid #111827',
              borderBottom: '6px solid transparent'
            }}
          ></div>
        </div>,
        document.body // ¡Renderizado directamente en el body!
      )}
    </>
  );
};
