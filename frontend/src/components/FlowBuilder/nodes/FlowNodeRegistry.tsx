/**
 * FLOW NODE VISUAL REGISTRY
 *
 * Maps node types to their visual configuration (icon, color, label, category).
 * Single source of truth for all node visual metadata in the Flow Builder.
 */

import React from "react";
import {
  MessageSquare,
  Image as ImageIcon,
  Video,
  Headphones,
  FileText,
  HelpCircle,
  GitBranch,
  Brain,
  DollarSign,
  UserPlus,
  UserCheck,
  Clock,
  CheckCircle,
  Zap,
  Globe,
  Tag,
  MailCheck,
  Play,
} from "lucide-react";
import { NodeType } from "@/types";

export interface NodeVisualConfig {
  icon: React.ReactNode;
  label: string;
  description: string;
  color: string;        // Tailwind bg class for the node header
  accentColor: string;  // Tailwind text class for the icon
  borderColor: string;  // Tailwind border class
  category: "messaging" | "interaction" | "crm" | "assignment" | "integration" | "control";
  hasOutputPort: boolean;
  hasTruePort?: boolean;
  hasFalsePort?: boolean;
  isTerminal?: boolean;
}

const iconProps = { size: 18, strokeWidth: 2.2 };

export const NODE_REGISTRY: Record<NodeType, NodeVisualConfig> = {
  trigger: {
    icon: <Play {...iconProps} />,
    label: "flow_builder.nodes.trigger.label",
    description: "flow_builder.nodes.trigger.desc",
    color: "bg-emerald-500",
    accentColor: "text-emerald-500",
    borderColor: "border-emerald-500/30",
    category: "control",
    hasOutputPort: true,
  },
  send_message: {
    icon: <MessageSquare {...iconProps} />,
    label: "flow_builder.nodes.send_message.label",
    description: "flow_builder.nodes.send_message.desc",
    color: "bg-blue-500",
    accentColor: "text-blue-500",
    borderColor: "border-blue-500/30",
    category: "messaging",
    hasOutputPort: true,
  },
  send_image: {
    icon: <ImageIcon {...iconProps} />,
    label: "flow_builder.nodes.send_image.label",
    description: "flow_builder.nodes.send_image.desc",
    color: "bg-violet-500",
    accentColor: "text-violet-500",
    borderColor: "border-violet-500/30",
    category: "messaging",
    hasOutputPort: true,
  },
  send_video: {
    icon: <Video {...iconProps} />,
    label: "flow_builder.nodes.send_video.label",
    description: "flow_builder.nodes.send_video.desc",
    color: "bg-pink-500",
    accentColor: "text-pink-500",
    borderColor: "border-pink-500/30",
    category: "messaging",
    hasOutputPort: true,
  },
  send_audio: {
    icon: <Headphones {...iconProps} />,
    label: "flow_builder.nodes.send_audio.label",
    description: "flow_builder.nodes.send_audio.desc",
    color: "bg-amber-500",
    accentColor: "text-amber-500",
    borderColor: "border-amber-500/30",
    category: "messaging",
    hasOutputPort: true,
  },
  send_document: {
    icon: <FileText {...iconProps} />,
    label: "flow_builder.nodes.send_document.label",
    description: "flow_builder.nodes.send_document.desc",
    color: "bg-orange-500",
    accentColor: "text-orange-500",
    borderColor: "border-orange-500/30",
    category: "messaging",
    hasOutputPort: true,
  },
  ask_data: {
    icon: <HelpCircle {...iconProps} />,
    label: "flow_builder.nodes.ask_data.label",
    description: "flow_builder.nodes.ask_data.desc",
    color: "bg-cyan-500",
    accentColor: "text-cyan-500",
    borderColor: "border-cyan-500/30",
    category: "interaction",
    hasOutputPort: true,
  },
  condition: {
    icon: <GitBranch {...iconProps} />,
    label: "flow_builder.nodes.condition.label",
    description: "flow_builder.nodes.condition.desc",
    color: "bg-yellow-500",
    accentColor: "text-yellow-500",
    borderColor: "border-yellow-500/30",
    category: "interaction",
    hasOutputPort: false,
    hasTruePort: true,
    hasFalsePort: true,
  },
  ai_agent: {
    icon: <Brain {...iconProps} />,
    label: "flow_builder.nodes.ai_agent.label",
    description: "flow_builder.nodes.ai_agent.desc",
    color: "bg-purple-500",
    accentColor: "text-purple-500",
    borderColor: "border-purple-500/30",
    category: "interaction",
    hasOutputPort: true,
  },
  create_deal: {
    icon: <DollarSign {...iconProps} />,
    label: "flow_builder.nodes.create_deal.label",
    description: "flow_builder.nodes.create_deal.desc",
    color: "bg-green-500",
    accentColor: "text-green-500",
    borderColor: "border-green-500/30",
    category: "crm",
    hasOutputPort: true,
  },
  update_contact: {
    icon: <UserPlus {...iconProps} />,
    label: "flow_builder.nodes.update_contact.label",
    description: "flow_builder.nodes.update_contact.desc",
    color: "bg-teal-500",
    accentColor: "text-teal-500",
    borderColor: "border-teal-500/30",
    category: "crm",
    hasOutputPort: true,
  },
  assign_agent: {
    icon: <UserCheck {...iconProps} />,
    label: "flow_builder.nodes.assign_agent.label",
    description: "flow_builder.nodes.assign_agent.desc",
    color: "bg-indigo-500",
    accentColor: "text-indigo-500",
    borderColor: "border-indigo-500/30",
    category: "assignment",
    hasOutputPort: false,
    isTerminal: true,
  },
  ai_handoff: {
    icon: <Zap {...iconProps} />,
    label: "flow_builder.nodes.ai_handoff.label",
    description: "flow_builder.nodes.ai_handoff.desc",
    color: "bg-rose-500",
    accentColor: "text-rose-500",
    borderColor: "border-rose-500/30",
    category: "assignment",
    hasOutputPort: false,
    isTerminal: true,
  },
  http_request: {
    icon: <Globe {...iconProps} />,
    label: "flow_builder.nodes.http_request.label",
    description: "flow_builder.nodes.http_request.desc",
    color: "bg-slate-600",
    accentColor: "text-slate-500",
    borderColor: "border-slate-500/30",
    category: "integration",
    hasOutputPort: true,
  },
  tag_contact: {
    icon: <Tag {...iconProps} />,
    label: "flow_builder.nodes.tag_contact.label",
    description: "flow_builder.nodes.tag_contact.desc",
    color: "bg-lime-500",
    accentColor: "text-lime-500",
    borderColor: "border-lime-500/30",
    category: "crm",
    hasOutputPort: true,
  },
  send_template: {
    icon: <MailCheck {...iconProps} />,
    label: "flow_builder.nodes.send_template.label",
    description: "flow_builder.nodes.send_template.desc",
    color: "bg-emerald-600",
    accentColor: "text-emerald-600",
    borderColor: "border-emerald-600/30",
    category: "messaging",
    hasOutputPort: true,
  },
  delay: {
    icon: <Clock {...iconProps} />,
    label: "flow_builder.nodes.delay.label",
    description: "flow_builder.nodes.delay.desc",
    color: "bg-gray-500",
    accentColor: "text-gray-500",
    borderColor: "border-gray-500/30",
    category: "control",
    hasOutputPort: true,
  },
  end: {
    icon: <CheckCircle {...iconProps} />,
    label: "flow_builder.nodes.end.label",
    description: "flow_builder.nodes.end.desc",
    color: "bg-red-500",
    accentColor: "text-red-500",
    borderColor: "border-red-500/30",
    category: "control",
    hasOutputPort: false,
    isTerminal: true,
  },
  // Legacy types
  message: {
    icon: <MessageSquare {...iconProps} />,
    label: "Message",
    description: "Legacy message node",
    color: "bg-blue-400",
    accentColor: "text-blue-400",
    borderColor: "border-blue-400/30",
    category: "messaging",
    hasOutputPort: true,
  },
  input: {
    icon: <HelpCircle {...iconProps} />,
    label: "Input",
    description: "Legacy input node",
    color: "bg-cyan-400",
    accentColor: "text-cyan-400",
    borderColor: "border-cyan-400/30",
    category: "interaction",
    hasOutputPort: true,
  },
  action_task: {
    icon: <CheckCircle {...iconProps} />,
    label: "CRM Task",
    description: "Create a task",
    color: "bg-amber-600",
    accentColor: "text-amber-600",
    borderColor: "border-amber-600/30",
    category: "crm",
    hasOutputPort: true,
  },
  action_calendar: {
    icon: <Clock {...iconProps} />,
    label: "Calendar",
    description: "Calendar event",
    color: "bg-sky-500",
    accentColor: "text-sky-500",
    borderColor: "border-sky-500/30",
    category: "crm",
    hasOutputPort: true,
  },
  action_email: {
    icon: <MailCheck {...iconProps} />,
    label: "Email",
    description: "Send email",
    color: "bg-orange-600",
    accentColor: "text-orange-600",
    borderColor: "border-orange-600/30",
    category: "messaging",
    hasOutputPort: true,
  },
};

/**
 * Get preview text for a node based on its type and data.
 */
export function getNodePreview(type: NodeType, data: Record<string, unknown>): string {
  switch (type) {
    case "send_message":
    case "message":
      return truncate(String(data.message || data.content || data.text || ""), 60);
    case "ask_data":
      return truncate(String(data.question || data.variable || ""), 50);
    case "condition":
      return data.conditionVariable
        ? `${data.conditionVariable} ${data.conditionOperator || "="} ${data.conditionValue || "?"}`
        : "Configure condition";
    case "ai_agent":
      return data.aiAssistantId ? "AI Connected" : "Select AI Agent";
    case "create_deal":
      return data.title ? `Deal: ${truncate(String(data.title), 30)}` : "New Deal";
    case "update_contact":
      return data.name || data.email || data.phone ? "Fields configured" : "Configure fields";
    case "assign_agent":
      return data.assignmentType === "queue" ? "Route to Queue" : "Assign to Agent";
    case "http_request":
      return data.webhookUrl || data.url ? truncate(String(data.webhookUrl || data.url), 40) : "Configure URL";
    case "tag_contact":
      return data.tags || data.tag ? `Tags: ${truncate(String(data.tags || data.tag), 30)}` : "Set tags";
    case "send_template":
      return data.templateName ? `Template: ${truncate(String(data.templateName), 30)}` : "Select template";
    case "delay":
      return data.content || data.delayValue ? `${data.content || data.delayValue}s` : "Configure delay";
    case "end":
      return truncate(String(data.message || "Flow ends"), 40);
    default:
      return truncate(String(data.label || ""), 40);
  }
}

function truncate(text: string, max: number): string {
  if (!text) return "";
  return text.length > max ? text.substring(0, max) + "..." : text;
}
