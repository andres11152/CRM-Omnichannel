import React, { useState, useEffect } from "react";
import {
  ActiveLoadChart,
  SalesFunnelWidget,
  AgentLeaderboardWidget,
  ChannelDistributionWidget,
  StatCard,
  RecentActivityModule,
  ActionButton,
} from "./DashboardWidgets";
import { TicketsKanbanView } from "./TicketsKanbanView";
import { PlanUsageWidget } from "./PlanUsageWidget";
import { updateUserPreferences } from "@/services/userService";
import {
  Ticket,
  Bot,
  Zap,
  MessageSquare,
  Mail,
  Users,
  Settings,
  Activity,
  Workflow,
} from "lucide-react";

// --- TYPES ---

export type DashboardLayoutType = "operational" | "strategic" | "analytical";

interface DashboardStats {
  activeTickets: number;
  totalMessages: number;
  aiResolution: string;
  avgResponseTime: string;
}

interface PlanInfo {
  name: string;
  usage: { label: string; current: number; max: number }[];
}

interface ActivityItem {
  id: string;
  type: string;
  text: string;
  time: string;
}

interface FunnelItem {
  name: string;
  value: number;
  fill?: string;
}
interface AgentItem {
  name: string;
  score: number;
  sales: number;
  avatar?: string;
}
interface ChannelItem {
  name: string;
  percentage: number;
  color?: string;
  iconClass?: string;
}
interface WorkloadItem {
  name: string;
  pending: number;
  inProgress: number;
}

interface DashboardUser {
  id: string;
  name: string;
  preferences?: Record<string, unknown>;
}

interface StaticDashboardProps {
  stats: DashboardStats;
  plan: PlanInfo | null;
  activities: ActivityItem[];
  salesFunnelData?: FunnelItem[];
  topAgentsData?: AgentItem[];
  channelStatsData?: ChannelItem[];
  agentWorkloadData?: WorkloadItem[];
  onNavigate?: (tab: string) => void;
  user?: DashboardUser;
  onUserUpdate?: (user: DashboardUser) => void;
}

// 1. OPERATIONAL / REAL-TIME (Focus: Efficiency & Now)
const OperationalLayout: React.FC<StaticDashboardProps> = ({
  stats,
  activities,
  agentWorkloadData,
  onNavigate,
}) => {
  return (
    <div className="grid grid-cols-12 gap-6 p-1 pb-10">
      {/* Top Row: Active Load & Key Status */}
      <div className="col-span-12 lg:col-span-8 h-[400px]">
        <ActiveLoadChart data={agentWorkloadData} />
      </div>
      <div className="col-span-12 lg:col-span-4 h-[400px] flex flex-col gap-6">
        <div className="flex-1">
          <StatCard
            title="Resolución por IA"
            value={stats.aiResolution}
            icon={<Bot className="w-6 h-6" />}
            color="text-purple-600 dark:text-purple-400"
            bg="bg-purple-50 dark:bg-purple-900/20"
          />
        </div>
        <div className="flex-1">
          <StatCard
            title="Tiempo Respuesta"
            value={stats.avgResponseTime}
            icon={<Zap className="w-6 h-6" />}
            color="text-amber-600 dark:text-amber-400"
            bg="bg-amber-50 dark:bg-amber-900/20"
          />
        </div>
      </div>

      {/* Middle: Tickets Board (Full Focus) */}
      <div className="col-span-12 h-[600px]">
        {/* Wrapped in card container style via internal component or verify if TicketsKanbanView has it */}
        <div className="h-full bg-white dark:bg-reply-panel-dark border border-slate-200 dark:border-reply-border-dark shadow-sm rounded-xl overflow-hidden p-4">
          <TicketsKanbanView />
        </div>
      </div>

      {/* Bottom: Recent Logs */}
      <div className="col-span-12 lg:col-span-6 h-[350px]">
        <RecentActivityModule activities={activities} />
      </div>
      <div className="col-span-12 lg:col-span-6 h-[350px] flex flex-col gap-4">
        {/* Quick Actions Placeholder or extra stats */}
        <div className="grid grid-cols-2 gap-4 h-full">
          <ActionButton
            onClick={() => onNavigate && onNavigate("queue")}
            icon={<Mail className="w-5 h-5" />}
            text="Bandeja de Entrada"
          />
          <ActionButton
            onClick={() => onNavigate && onNavigate("contacts")}
            icon={<Users className="w-5 h-5" />}
            text="Gestionar Contactos"
          />
          <ActionButton
            onClick={() => onNavigate && onNavigate("flows")}
            icon={<Workflow className="w-5 h-5" />}
            text="Automatizaciones"
          />
          <ActionButton
            onClick={() => onNavigate && onNavigate("settings")}
            icon={<Settings className="w-5 h-5" />}
            text="Configuración"
          />
        </div>
      </div>
    </div>
  );
};

// 2. STRATEGIC / SALES (Focus: Revenue & People)
const StrategicLayout: React.FC<StaticDashboardProps> = ({
  stats,
  salesFunnelData,
  topAgentsData,
  channelStatsData,
  plan,
}) => {
  return (
    <div className="grid grid-cols-12 gap-6 p-1 pb-10">
      {/* Top Row: Sales Pipeline DESTACADO */}
      <div className="col-span-12 lg:col-span-7 h-[480px]">
        <SalesFunnelWidget data={salesFunnelData} />
      </div>

      {/* Top Right: Top Performers */}
      <div className="col-span-12 lg:col-span-5 h-[480px]">
        <AgentLeaderboardWidget agents={topAgentsData} />
      </div>

      {/* Middle Row: Key Metrics */}
      <div className="col-span-12 lg:col-span-3 h-[200px]">
        <StatCard
          title="Tickets Activos"
          value={stats.activeTickets}
          icon={<Ticket className="w-6 h-6" />}
          color="text-indigo-600 dark:text-indigo-400"
          bg="bg-indigo-50 dark:bg-indigo-900/20"
        />
      </div>
      <div className="col-span-12 lg:col-span-3 h-[200px]">
        <StatCard
          title="Total Mensajes"
          value={stats.totalMessages.toLocaleString()}
          icon={<MessageSquare className="w-6 h-6" />}
          color="text-blue-600 dark:text-blue-400"
          bg="bg-blue-50 dark:bg-blue-900/20"
        />
      </div>
      <div className="col-span-12 lg:col-span-3 h-[200px]">
        <StatCard
          title="Resolución IA"
          value={stats.aiResolution}
          icon={<Bot className="w-6 h-6" />}
          color="text-purple-600 dark:text-purple-400"
          bg="bg-purple-50 dark:bg-purple-900/20"
        />
      </div>
      <div className="col-span-12 lg:col-span-3 h-[200px]">
        <StatCard
          title="Tiempo Respuesta"
          value={stats.avgResponseTime}
          icon={<Zap className="w-6 h-6" />}
          color="text-amber-600 dark:text-amber-400"
          bg="bg-amber-50 dark:bg-amber-900/20"
        />
      </div>

      {/* Bottom Row: Distribution & Plan */}
      <div className="col-span-12 lg:col-span-8 h-[400px]">
        <ChannelDistributionWidget channels={channelStatsData} />
      </div>
      <div className="col-span-12 lg:col-span-4 h-[400px]">
        <PlanUsageWidget
          planName={plan?.name || "Sin Plan"}
          usage={(plan?.usage || []).map((u) => ({
            label: u.label,
            used: u.current,
            limit: u.max,
            unit: "",
          }))}
        />
      </div>
    </div>
  );
};

// 3. ANALYTICAL / OVERVIEW (Focus: Balanced View)
const AnalyticalLayout: React.FC<StaticDashboardProps> = ({
  stats,
  plan,
  activities,
  salesFunnelData,
  topAgentsData,
  channelStatsData,
  agentWorkloadData,
}) => {
  return (
    <div className="grid grid-cols-12 gap-6 p-1 pb-10">
      {/* Top Cards Row */}
      <div className="col-span-6 lg:col-span-3 h-[180px]">
        <StatCard
          title="Tickets Activos"
          value={stats.activeTickets}
          icon={<Ticket className="w-6 h-6" />}
          color="text-indigo-600 dark:text-indigo-400"
          bg="bg-indigo-50 dark:bg-indigo-900/20"
        />
      </div>
      <div className="col-span-6 lg:col-span-3 h-[180px]">
        <StatCard
          title="Resolución IA"
          value={stats.aiResolution}
          icon={<Bot className="w-6 h-6" />}
          color="text-purple-600 dark:text-purple-400"
          bg="bg-purple-50 dark:bg-purple-900/20"
        />
      </div>
      <div className="col-span-6 lg:col-span-3 h-[180px]">
        <StatCard
          title="Tiempo Respuesta"
          value={stats.avgResponseTime}
          icon={<Zap className="w-6 h-6" />}
          color="text-amber-600 dark:text-amber-400"
          bg="bg-amber-50 dark:bg-amber-900/20"
        />
      </div>
      <div className="col-span-6 lg:col-span-3 h-[180px]">
        <StatCard
          title="Total Mensajes"
          value={stats.totalMessages}
          icon={<MessageSquare className="w-6 h-6" />}
          color="text-blue-600 dark:text-blue-400"
          bg="bg-blue-50 dark:bg-blue-900/20"
        />
      </div>

      {/* Charts Row */}
      <div className="col-span-12 lg:col-span-8 h-[450px]">
        <ActiveLoadChart data={agentWorkloadData} />
      </div>
      <div className="col-span-12 lg:col-span-4 h-[450px]">
        <ChannelDistributionWidget channels={channelStatsData} />
      </div>

      {/* Bottom Row */}
      <div className="col-span-12 lg:col-span-4 h-[400px]">
        <SalesFunnelWidget data={salesFunnelData} />
      </div>
      <div className="col-span-12 lg:col-span-4 h-[400px]">
        <AgentLeaderboardWidget agents={topAgentsData} />
      </div>
      <div className="col-span-12 lg:col-span-4 h-[400px]">
        <RecentActivityModule activities={activities} />
      </div>
    </div>
  );
};

// --- MAIN WRAPPER COMPONENT ---

// --- MAIN WRAPPER COMPONENT ---

export const StaticDashboard: React.FC<
  StaticDashboardProps & { currentLayout?: DashboardLayoutType }
> = (props) => {
  // Si no se pasa currentLayout, usa default 'operational' (fallback)
  const activeLayout = props.currentLayout || "operational";

  return (
    <div className="space-y-6">
      {/* Layout Content */}
      <div className="transition-opacity duration-300 opacity-100 scale-100 h-full">
        {activeLayout === "operational" && <OperationalLayout {...props} />}
        {activeLayout === "strategic" && <StrategicLayout {...props} />}
        {activeLayout === "analytical" && <AnalyticalLayout {...props} />}
      </div>
    </div>
  );
};
