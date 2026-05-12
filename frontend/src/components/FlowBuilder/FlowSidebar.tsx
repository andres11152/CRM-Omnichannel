
import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NodeType } from '@/types';
import { NODE_REGISTRY } from './nodes/FlowNodeRegistry';
import { useTranslation } from "react-i18next";

interface FlowSidebarProps {
  onAddNode: (type: NodeType) => void;
}

interface SidebarCategory {
  title: string;
  types: NodeType[];
}

const SIDEBAR_CATEGORIES: SidebarCategory[] = [
  {
    title: "flow_builder.categories.messaging",
    types: ["send_message", "send_image", "send_video", "send_audio", "send_document", "send_template"],
  },
  {
    title: "flow_builder.categories.interaction",
    types: ["ask_data", "condition", "ai_agent"],
  },
  {
    title: "flow_builder.categories.crm",
    types: ["create_deal", "update_contact", "tag_contact"],
  },
  {
    title: "flow_builder.categories.assignment",
    types: ["assign_agent", "ai_handoff"],
  },
  {
    title: "flow_builder.categories.integration",
    types: ["http_request"],
  },
  {
    title: "flow_builder.categories.control",
    types: ["delay", "end"],
  },
];

export const FlowSidebar: React.FC<FlowSidebarProps> = ({ onAddNode }) => {
  const { t } = useTranslation();
  const [activeTooltip, setActiveTooltip] = useState<{ id: string; position: { x: number; y: number } } | null>(null);

  return (
    <div className="w-16 bg-white dark:bg-reply-panel-dark border-r border-gray-200 dark:border-reply-border-dark flex flex-col items-center py-4 gap-1 z-10 shadow-sm overflow-y-auto custom-scrollbar">
      {SIDEBAR_CATEGORIES.map((category, catIdx) => (
        <React.Fragment key={category.title}>
          {catIdx > 0 && (
            <div className="w-8 h-[1px] bg-gray-200 dark:bg-gray-700 my-1.5" />
          )}
          {category.types.map((type) => {
            const config = NODE_REGISTRY[type];
            if (!config) return null;
            return (
              <TooltipTool
                key={type}
                id={type}
                onClick={() => onAddNode(type)}
                icon={config.icon}
                label={t(config.label)}
                description={t(config.description)}
                color={config.color}
                activeTooltip={activeTooltip}
                setActiveTooltip={setActiveTooltip}
              />
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
};

const TooltipTool: React.FC<{
  id: string;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
  color: string;
  activeTooltip: { id: string; position: { x: number; y: number } } | null;
  setActiveTooltip: (tooltip: { id: string; position: { x: number; y: number } } | null) => void;
}> = ({ id, onClick, icon, label, description, color, activeTooltip, setActiveTooltip }) => {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleMouseEnter = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setActiveTooltip({
        id,
        position: {
          x: rect.right + 12,
          y: rect.top + rect.height / 2
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
        className={`w-10 h-10 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-xl flex items-center justify-center hover:text-white transition-all shadow-sm group relative hover:scale-110 active:scale-95 hover:shadow-lg hover:${color}`}
      >
        {icon}
      </button>

      {isActive && activeTooltip && createPortal(
        <div
          className="fixed bg-slate-900 dark:bg-slate-800 text-white p-3 rounded-xl shadow-2xl min-w-[200px] max-w-[260px] pointer-events-none border border-slate-700/50 backdrop-blur-md"
          style={{
            left: `${activeTooltip.position.x}px`,
            top: `${activeTooltip.position.y}px`,
            transform: 'translateY(-50%)',
            zIndex: 999999
          }}
        >
          <div className="font-bold mb-0.5 text-indigo-300 text-[10px] uppercase tracking-wider">{label}</div>
          <div className="text-gray-300 text-[11px] leading-relaxed">{description}</div>
          <div
            className="absolute w-0 h-0"
            style={{
              left: '-6px',
              top: '50%',
              transform: 'translateY(-50%)',
              borderTop: '6px solid transparent',
              borderRight: '6px solid #0f172a',
              borderBottom: '6px solid transparent'
            }}
          />
        </div>,
        document.body
      )}
    </>
  );
};
