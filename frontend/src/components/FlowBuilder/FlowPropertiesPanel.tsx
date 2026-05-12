import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FlowNode } from "@/types";
import { API_BASE_URL } from "@/services/apiConfig";

// Properties Panels
import { AINodeProperties } from "./PropertiesPanels/AINodeProperties";
import { MediaNodeProperties } from "./PropertiesPanels/MediaNodeProperties";
import { MessageNodeProperties } from "./PropertiesPanels/MessageNodeProperties";
import { CRMNodeProperties } from "./PropertiesPanels/CRMNodeProperties";
import { RoutingNodeProperties } from "./PropertiesPanels/RoutingNodeProperties";
import { ActionNodeProperties } from "./PropertiesPanels/ActionNodeProperties";
import { SystemNodeProperties } from "./PropertiesPanels/SystemNodeProperties";
import { IntegrationNodeProperties } from "./PropertiesPanels/IntegrationNodeProperties";

interface FlowPropertiesPanelProps {
  node: FlowNode;
  onUpdate: (key: string, value: unknown) => void;
  onDelete: () => void;
}

export const FlowPropertiesPanel: React.FC<FlowPropertiesPanelProps> = ({
  node,
  onUpdate,
  onDelete,
}) => {
  const { t } = useTranslation();
  const [aiAgents, setAiAgents] = useState<
    Array<{
      id: string;
      name: string;
      modelName?: string;
      model?: string;
      description?: string;
    }>
  >([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
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

  return (
    <div className="w-80 bg-white dark:bg-reply-panel-dark border-l border-gray-200 dark:border-reply-border-dark p-6 shadow-lg z-20 overflow-y-auto animate-slide-in-right h-full">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-bold text-gray-800 dark:text-white">{t("common.soon")}</h3>
        <button
          onClick={onDelete}
          className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors"
          title={t("common.delete")}
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
            {t("common.name")}
          </label>
          <input
            type="text"
            value={node.data.label}
            onChange={(e) => onUpdate("label", e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        {/* TYPE SPECIFIC FIELDS */}
        <MessageNodeProperties node={node} onUpdate={onUpdate} />
        <MediaNodeProperties node={node} onUpdate={onUpdate} />
        <CRMNodeProperties node={node} onUpdate={onUpdate} />
        <RoutingNodeProperties node={node} onUpdate={onUpdate} />
        <ActionNodeProperties node={node} onUpdate={onUpdate} />
        <SystemNodeProperties node={node} onUpdate={onUpdate} />
        <IntegrationNodeProperties node={node} onUpdate={onUpdate} />
        
        {/*  AI AGENT NODE */}
        {node.type === "ai_agent" && (
          <AINodeProperties node={node} onUpdate={onUpdate} aiAgents={aiAgents} loadingAgents={loadingAgents} />
        )}

        <div className="pt-4 border-t border-gray-200 dark:border-reply-border-dark mt-auto">
          <p className="text-xs text-gray-400">ID: {node.id}</p>
          <p className="text-xs text-gray-400">
            {t("tenants.metrics.status")}: {node.type.toUpperCase()}
          </p>
        </div>
      </div>
    </div>
  );
};
