import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Plan, Company, User, UserRole } from "@/types";
import { adminService } from "@/services/adminService";
import { API_BASE_URL } from "@/services/apiConfig";
import { TicketsKanbanView } from "./TicketsKanbanView";
import { ModuleHeader } from "./common/ModuleHeader";
import {
  StatCard,
  MrrTrendModule,
  PlanDistributionModule,
  SystemStatusModule,
  TopTenantsModule,
  RecentActivityModule,
  SalesFunnelWidget,
  ActiveLoadChart,
  AgentLeaderboardWidget,
  ChannelDistributionWidget
} from "./DashboardWidgets";
import { updateUserPreferences } from "@/services/userService";
import { Skeleton } from "boneyard-js/react";
import {
  Zap,
  TrendingUp,
  TrendingDown,
  PieChart,
  BarChart3,
  MessageSquare,
  Building2,
  Users,
  DollarSign,
  Activity,
  ArrowRight,
  Check,
  X,
  Shield,
  Cpu,
  Webhook,
  Clock,
  Database,
  Bot,
  HardDrive,
  Contact,
  Layers,
  Workflow,
} from "lucide-react";
import { ActivityFeed, ActivityItem } from "./dashboard/ActivityFeed";
import {
  TenantHealthWidget,
  TenantHealth,
} from "./dashboard/TenantHealthWidget";
import { api } from "@/lib/axios";

interface Props {
  role: UserRole | string;
  onNavigate?: (tab: string) => void;
  user?: User;
  onUserUpdate?: (user: Partial<User>) => void;
}

export const MainDashboard: React.FC<Props> = ({
  role,
  onNavigate,
  user,
  onUserUpdate,
}) => {
  // Route to appropriate dashboard based on role
  if (role === "master" || role === "MASTER") {
    return <MasterAdminDashboard onNavigate={onNavigate} />;
  }

  if (role === "AGENT") {
    // [BUILD] AGENT DASHBOARD: Personalized, focused, gamified.
    return <AgentDashboard user={user} onNavigate={onNavigate} />;
  }

  return (
    <CompanyAdminDashboard
      onNavigate={onNavigate}
      user={user}
      onUserUpdate={onUserUpdate}
    />
  );
};

// --- MASTER ADMIN DASHBOARD (PROFESSIONAL SaaS Style) ---
const MasterAdminDashboard: React.FC<{
  onNavigate?: (tab: string) => void;
}> = ({ onNavigate }) => {
  const [stats, setStats] = useState<{
    totalCompanies: number;
    activeCompanies: number;
    totalRevenue: number;
    activeUsers: number;
    systemHealth: string;
    financials?: {
      mrr?: number;
      trend?: { name: string; revenue: number }[];
      distribution?: { name: string; value: number }[];
    };
    systemStatus?: {
      api: { status: string; latency: number };
      database: { status: string; latency: number };
      queues: { status: string; latency: number };
      storage: { status: string; latency: number };
    };
  }>({
    totalCompanies: 0,
    activeCompanies: 0,
    totalRevenue: 0,
    activeUsers: 0,
    systemHealth: "100%",
  });
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const { t } = useTranslation();

  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [tenantHealth, setTenantHealth] = useState<TenantHealth[]>([]);

  useEffect(() => {
    fetchMasterStats();
    fetchCompanies();

    // Live Activity Feed Polling
    const loadActivity = async () => {
      try {
        const data =
          (await adminService.getGlobalActivity()) as unknown as ActivityItem[];
        setActivity(data);
      } catch (e) {
        console.error("Activity feed error", e);
      }
    };
    loadActivity(); // Initial fetch
    const interval = setInterval(loadActivity, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchMasterStats = async () => {
    try {
      let newStats: typeof stats = { ...stats };

      // 1. Core Stats
      try {
        const response = await api.get("/admin/dashboard-stats");
        if (response.data) {
          newStats = { ...newStats, ...response.data };
        }
      } catch (e) {
        console.error("Dashboard Stats failed", e);
      }

      // 2. System Status
      try {
        const systemStatus = await adminService.getSystemStatus();
        newStats.systemStatus = systemStatus;
      } catch (e) {
        console.error("System Status failed", e);
      }

      // 3. Financials
      try {
        const financials = await adminService.getFinancials();
        newStats.financials = financials as typeof stats.financials;
      } catch (e) {
        console.error("Financials failed", e);
      }

      // 4. Tenant Health (Churn)
      try {
        const health =
          (await adminService.getTenantHealth()) as unknown as TenantHealth[];
        setTenantHealth(health);
      } catch (e) {
        console.error("Health failed", e);
      }

      setStats(newStats);
    } catch (error) {
      console.error("Error fetching master stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      const companies = await adminService.getAllCompanies();
      setCompanies(companies || []);
      // Update stats with real data
      setStats((prev) => ({
        ...prev,
        totalCompanies: companies?.length || 0,
        activeCompanies:
          companies?.filter((c: Company) => c.isActive).length || 0,
      }));
    } catch (error) {
      console.error("Error fetching companies:", error);
    }
  };

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark overflow-hidden">
      <ModuleHeader
        title={t("dashboard.master_title", "Admin Central")}
        description={t("dashboard.master_desc", "Panel maestro de orquestación y monitoreo del ecosistema Sentry")}
        icon={<BarChart3 className="w-8 h-8 text-white" />}
        gradient="from-slate-900 via-indigo-900 to-indigo-800 dark:from-black dark:via-indigo-950 dark:to-slate-900"
        stats={{
          label: t("dashboard.active_ecosystem", "Active Ecosystem"),
          value: `${stats.activeCompanies} ${t("dashboard.tenants", "Tenants")}`,
        }}
      />

      <div className="flex-1 p-6 md:p-8 overflow-y-auto custom-scrollbar bg-slate-50/50 dark:bg-transparent">
        <Skeleton name="main-dashboard" loading={loading}>
          {/* KPIs Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <StatCard
            title={t("dashboard.total_companies", "Total Empresas")}
            value={stats.totalCompanies}
            icon={<Building2 className="w-6 h-6" />}
            color="text-blue-600 dark:text-blue-400"
            bg="bg-blue-50 dark:bg-blue-900/30"
            isLoading={loading}
          />
          <StatCard
            title={t("dashboard.active_companies", "Empresas Activas")}
            value={stats.activeCompanies}
            icon={<Zap className="w-6 h-6" />}
            color="text-green-600 dark:text-green-400"
            bg="bg-green-50 dark:bg-green-900/30"
            isLoading={loading}
          />
          <StatCard
            title={t("dashboard.total_mrr", "MRR Total")}
            value={`$${(stats.financials?.mrr || 0).toLocaleString()}`}
            icon={<TrendingUp className="w-6 h-6" />}
            color="text-purple-600 dark:text-purple-400"
            bg="bg-purple-50 dark:bg-purple-900/30"
            isLoading={loading}
          />
          <StatCard
            title={t("dashboard.active_users", "Usuarios Activos")}
            value={stats.activeUsers}
            icon={<Users className="w-6 h-6" />}
            color="text-cyan-600 dark:text-cyan-400"
            bg="bg-cyan-50 dark:bg-cyan-900/30"
            isLoading={loading}
          />
        </div>

        {/* Charts & Widgets Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2">
            <MrrTrendModule data={stats.financials?.trend || []} />
          </div>
          <div>
            <PlanDistributionModule
              data={stats.financials?.distribution || []}
            />
          </div>
        </div>

        {/* Secondary Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <div>
              <div className="bg-white dark:bg-reply-panel-dark p-6 rounded-xl shadow-sm border border-slate-200 dark:border-reply-border-dark h-[400px] flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-500" />
                    {t("dashboard.churn_risk", "Salud de Cartera (Churn Risk)")}
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <TenantHealthWidget
                    tenants={tenantHealth}
                    loading={loading}
                  />
                </div>
              </div>
            </div>
          </div>
          <div>
            <SystemStatusModule data={stats.systemStatus} />
          </div>
          <div>
            <div className="bg-white dark:bg-reply-panel-dark p-6 rounded-xl shadow-sm border border-slate-200 dark:border-reply-border-dark h-[400px] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-indigo-500" />
                  {t("dashboard.global_activity", "Actividad Global")}
                </h3>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 -mr-2">
                <ActivityFeed activities={activity} loading={loading} />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 bg-white dark:bg-reply-panel-dark rounded-xl shadow-sm border border-slate-200 dark:border-reply-border-dark p-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            {t("dashboard.quick_actions", "Acciones Rápidas")}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => onNavigate?.("tenants")}
              className="group flex items-center justify-between p-4 rounded-lg border-2 border-slate-200 dark:border-reply-border-dark hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md transition-all text-left bg-white dark:bg-slate-800"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">
                    {t("dashboard.manage_companies", "Gestión de Empresas")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("dashboard.manage_companies_desc", "Administrar clientes")}
                  </p>
                </div>
              </div>
              <svg
                className="w-5 h-5 text-slate-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>

            <button
              onClick={() => onNavigate?.("plans")}
              className="group flex items-center justify-between p-4 rounded-lg border-2 border-slate-200 dark:border-reply-border-dark hover:border-purple-500 dark:hover:border-purple-500 hover:shadow-md transition-all text-left bg-white dark:bg-slate-800"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <DollarSign className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">
                    {t("dashboard.manage_plans", "Gestión de Planes")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("dashboard.manage_plans_desc", "Configurar suscripciones")}
                  </p>
                </div>
              </div>
              <svg
                className="w-5 h-5 text-slate-400 group-hover:text-purple-500 group-hover:translate-x-1 transition-all"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>

            <button
              onClick={() => onNavigate?.("audit")}
              className="group flex items-center justify-between p-4 rounded-lg border-2 border-slate-200 dark:border-reply-border-dark hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-md transition-all text-left bg-white dark:bg-slate-800"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Shield className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">
                    {t("dashboard.audit_logs", "Forensics & Audit")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("dashboard.audit_logs_desc", "Registros de seguridad")}
                  </p>
                </div>
              </div>
              <svg
                className="w-5 h-5 text-slate-400 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>

            <button
              onClick={() => onNavigate?.("schema")}
              className="group flex items-center justify-between p-4 rounded-lg border-2 border-slate-200 dark:border-reply-border-dark hover:border-teal-500 dark:hover:border-teal-500 hover:shadow-md transition-all text-left bg-white dark:bg-slate-800"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <BarChart3 className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">
                    {t("dashboard.database", "Base de Datos")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("dashboard.database_desc", "Visualizar esquema")}
                  </p>
                </div>
              </div>
              <svg
                className="w-5 h-5 text-slate-400 group-hover:text-teal-500 group-hover:translate-x-1 transition-all"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>
        </Skeleton>
      </div>
    </div>
  );
};

// --- DASHBOARD TYPES ---
interface DashboardMetrics {
  activeTickets: number;
  totalMessages: number;
  activeConversations: number;
  aiResolution: string;
  avgResponseTime: string;
}

interface UsageMetric {
  label: string;
  used: number;
  limit: number;
  unit: string;
}

interface PlanFeature {
  label: string;
  enabled: boolean;
  icon: string;
}

interface DashboardPlan {
  name: string;
  price?: number;
  usage: UsageMetric[];
  features?: PlanFeature[];
  expiresAt?: string;
  trialEndsAt?: string;
  status?: string;
  isActive?: boolean;
}

interface DashboardData {
  metrics: DashboardMetrics;
  plan: DashboardPlan;
  salesFunnel?: { name: string; count: number; value: number; color?: string }[];
  agentWorkload?: { name: string; pending: number; inProgress: number }[];
  channelDistribution?: { name: string; percentage: number; color?: string; iconClass?: string }[];
  topAgents?: { name: string; score: number; sales: number; avatar?: string }[];
}

// --- STATUS BADGE COMPONENT ---
const StatusBadge: React.FC<{ status?: string; isActive?: boolean }> = ({
  status,
  isActive,
}) => {
  const { t } = useTranslation();
  const statusMap: Record<string, { label: string; color: string }> = {
    ACTIVE: { label: t("dashboard.status.active", "Activo"), color: "bg-emerald-500" },
    TRIAL: { label: t("dashboard.status.trial", "Prueba"), color: "bg-amber-500" },
    SUSPENDED: { label: t("dashboard.status.suspended", "Suspendido"), color: "bg-rose-500" },
    INACTIVE: { label: t("dashboard.status.inactive", "Inactivo"), color: "bg-slate-500" },
  };
  const info = statusMap[status || "INACTIVE"] || statusMap.INACTIVE;
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${info.color} text-white`}
    >
      {info.label}
    </span>
  );
};

// --- AGENT DASHBOARD (Gamified & Focused) ---
interface AgentStats {
  activeTickets: number;
  resolvedToday: number;
  messagesSentToday: number;
  recentTickets: {
    id: string;
    ticketNumber: number;
    subject: string;
    status: string;
    priority: string;
    queueName: string;
    updatedAt: string;
  }[];
}

const AgentDashboard: React.FC<{
  onNavigate?: (tab: string) => void;
  user?: User;
}> = ({ onNavigate, user }) => {
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const fetchAgentStats = async () => {
      try {
        const response = await api.get("/dashboard/agent-stats");
        if (response.data && response.data.data) {
          setStats(response.data.data);
        }
      } catch (error) {
        console.error("Failed to fetch agent stats", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAgentStats();
  }, []);

  const todayDate = new Date().toLocaleDateString(i18n.language, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark overflow-hidden font-sans">
      {/* 1. WELCOME HEADER */}
      <div className="bg-white dark:bg-reply-surface-dark border-b border-slate-200 dark:border-reply-border-dark px-4 sm:px-8 py-4 sm:py-6 shadow-sm z-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mb-1 flex items-center gap-2">
              {t("dashboard.agent_greeting", "Hola")}, {user?.name?.split(" ")[0]}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {t("dashboard.agent_subtitle", "¡Vamos con todo hoy! Aquí tienes tu resumen personal.")}
            </p>
          </div>
          <div className="shrink-0">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-reply-border-dark">
              <Activity className="w-4 h-4 text-orange-500 animate-pulse shrink-0" />
              <span className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 lowercase first-letter:uppercase whitespace-nowrap">
                {todayDate}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 lg:p-8">
        {/* 2. PERSONAL METRICS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Active Tickets (Focus) */}
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg shadow-indigo-900/20 relative overflow-hidden group hover:shadow-xl transition-all">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-500">
              <MessageSquare className="w-24 h-24 text-white" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2 opacity-90">
                <Layers className="w-5 h-5" />
                <span className="text-sm font-medium uppercase tracking-wide">
                  {t("dashboard.inbox_title", "En tu bandeja")}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold">
                  {loading ? "-" : stats?.activeTickets || 0}
                </span>
                <span className="text-sm opacity-80">{t("dashboard.active_tickets", "tickets activos")}</span>
              </div>
              <div className="mt-4 pt-4 border-t border-white/20">
                <button
                  onClick={() => onNavigate?.("tickets")}
                  className="text-xs font-bold bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded transition-colors flex items-center gap-2 w-fit"
                >
                  {t("dashboard.go_to_tickets", "Ir a mis tickets")} <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Resolved Today (Motivation) */}
          <div className="bg-white dark:bg-reply-panel-dark rounded-2xl p-6 border-l-4 border-emerald-500 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400">
                <Check className="w-6 h-6" />
              </div>
              {(stats?.resolvedToday && stats.resolvedToday > 0 && (
                <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full animate-pulse">
                  {t("dashboard.well_done", "¡Bien hecho!")}
                </span>
              )) ||
                null}
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                {t("dashboard.resolved_today", "Resueltos Hoy")}
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-bold text-slate-900 dark:text-white">
                  {loading ? "-" : stats?.resolvedToday || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Messages-ESent (Output) */}
          <div className="bg-white dark:bg-reply-panel-dark rounded-2xl p-6 border-l-4 border-blue-500 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 dark:text-blue-400">
                <Zap className="w-6 h-6" />
              </div>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                {t("dashboard.messages_sent", "Mensajes Enviados")}
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-bold text-slate-900 dark:text-white">
                  {loading ? "-" : stats?.messagesSentToday || 0}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {t("dashboard.high_activity", "Alto nivel de actividad")} 
              </p>
            </div>
          </div>
        </div>

        {/* 3. RECENT ACTIVITY LIST */}
        <div className="bg-white dark:bg-reply-panel-dark rounded-xl shadow-sm border border-slate-200 dark:border-reply-border-dark p-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-400" />
            {t("dashboard.recent_activity", "Vistos recientemente")}
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">{t("dashboard.table_ticket", "Ticket")}</th>
                  <th className="px-4 py-3">{t("dashboard.table_status", "Estado")}</th>
                  <th className="px-4 py-3">{t("dashboard.table_priority", "Prioridad")}</th>
                  <th className="px-4 py-3">{t("dashboard.table_queue", "Cola")}</th>
                  <th className="px-4 py-3 rounded-r-lg text-right">
                    {t("dashboard.table_updated", "Actualizado")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400">
                      {t("common.loading", "Cargando...")}
                    </td>
                  </tr>
                ) : stats?.recentTickets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400">
                      {t("dashboard.no_recent_activity", "No hay actividad reciente")}
                    </td>
                  </tr>
                ) : (
                  stats?.recentTickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        #{ticket.ticketNumber} - {ticket.subject}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold
                          ${
                            ticket.status === "OPEN"
                              ? "bg-blue-100 text-blue-700"
                              : ticket.status === "IN_PROGRESS"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {ticket.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold
                          ${
                            ticket.priority === "URGENT"
                              ? "bg-rose-100 text-rose-700"
                              : ticket.priority === "HIGH"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {ticket.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {ticket.queueName}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400">
                        {new Date(ticket.updatedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- COMPANY ADMIN DASHBOARD (ENTERPRISE - REDESIGNED) ---
const CompanyAdminDashboard: React.FC<{
  onNavigate?: (tab: string) => void;
  user?: User;
  onUserUpdate?: (user: Partial<User>) => void;
}> = ({ onNavigate, user, onUserUpdate }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get("/dashboard/stats");
        if (response.data && response.data.data) {
          setData(response.data.data);
        } else {
          setData(response.data);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard stats", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const getUsagePercent = (used: number, limit: number) => {
    if (limit === -1) return 0;
    if (limit === 0) return 0;
    return Math.min((used / limit) * 100, 100);
  };

  const isPlanActive =
    data?.plan?.isActive ??
    (data?.plan?.status === "ACTIVE" || data?.plan?.status === "TRIAL");

  const todayDate = new Date().toLocaleDateString(i18n.language, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const getUsageColor = (pct: number) => {
    if (pct > 90) return "bg-rose-500";
    if (pct > 75) return "bg-amber-400";
    return "bg-emerald-500";
  };

  const getUsageTextColor = (pct: number) => {
    if (pct > 90) return "text-rose-400";
    if (pct > 75) return "text-amber-400";
    return "text-emerald-400";
  };

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark overflow-hidden font-sans">
      <div className="bg-white dark:bg-reply-surface-dark border-b border-slate-200 dark:border-reply-border-dark px-4 sm:px-8 py-4 sm:py-6 shadow-sm z-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mb-1">
              {t("dashboard.navigation.dashboard", "Panel de Control")}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {user?.name
                ? t("dashboard.welcome_admin", { name: user.name, defaultValue: `Bienvenido, ${user.name}. Aquí tienes la visión general de tu negocio.` })
                : t("dashboard.welcome_admin_generic", "Bienvenido. Aquí tienes la visión general de tu negocio.")
              }
            </p>
          </div>
          <div className="shrink-0">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-reply-border-dark">
              <Activity className="w-4 h-4 text-blue-500 animate-pulse shrink-0" />
              <span className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 lowercase first-letter:uppercase whitespace-nowrap">
                {todayDate}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 sm:p-6 text-white shadow-lg shadow-blue-900/20 relative overflow-hidden group hover:shadow-xl transition-all flex flex-col h-full">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
            <div className="absolute top-1/2 right-0 transform -translate-y-1/2 p-4 opacity-10 group-hover:opacity-20 transition-all duration-500 group-hover:scale-110">
              <MessageSquare className="w-24 h-24 text-white" />
            </div>
            
            <div className="relative z-10 flex-1 flex flex-col">
              <div className="flex items-center gap-2 opacity-90 mb-2">
                <MessageSquare className="w-5 h-5" />
                <span className="text-sm font-medium uppercase tracking-wide">
                  {t("dashboard.tickets_active", "Tickets Activos")}
                </span>
              </div>
              
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold">
                  {loading ? "-" : data?.metrics?.activeTickets || 0}
                </span>
                <span className="text-sm opacity-80">{t("dashboard.pending", "pendientes")}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-auto pt-4 border-t border-white/20">
                <div>
                  <p className="text-[10px] uppercase font-bold opacity-70 mb-0.5 tracking-wider">{t("dashboard.conversations", "Conversaciones")}</p>
                  <p className="font-mono text-lg font-semibold flex items-center gap-1">
                    {data?.metrics?.activeConversations || 0}
                    <Activity className="w-3 h-3 opacity-50" />
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold opacity-70 mb-0.5 tracking-wider">{t("dashboard.msgs_today", "Msjs Hoy")}</p>
                  <p className="font-mono text-lg font-semibold flex items-center gap-1">
                    {data?.metrics?.totalMessages || 0}
                    <Zap className="w-3 h-3 opacity-50" />
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-reply-panel-dark rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-reply-border-dark shadow-sm hover:border-amber-400/50 transition-colors group flex flex-col h-full">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-amber-600 dark:text-amber-400">
                <Clock className="w-6 h-6" />
              </div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                KPI
              </span>
            </div>
            
            <div className="flex-1 flex flex-col">
              <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                {t("dashboard.response_time", "Tiempo Respuesta")}
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-bold text-slate-900 dark:text-white">
                  {loading ? "..." : data?.metrics?.avgResponseTime || "0s"}
                </span>
              </div>
              <div className="mt-auto pt-4">
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  {t("dashboard.avg_7_days", "Promedio últimos 7 días")}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-reply-panel-dark rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-reply-border-dark shadow-sm hover:border-purple-400/50 transition-colors group flex flex-col h-full">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl text-purple-600 dark:text-purple-400">
                <Zap className="w-6 h-6" />
              </div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                KPI
              </span>
            </div>
            
            <div className="flex-1 flex flex-col">
              <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                {t("dashboard.ai_resolution", "Resolución IA")}
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-bold text-slate-900 dark:text-white">
                  {loading ? "..." : data?.metrics?.aiResolution || "0%"}
                </span>
              </div>
              <div className="mt-auto pt-4">
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Bot className="w-3 h-3" />
                  {t("dashboard.closed_auto", "Cerrados automáticamente")}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-800 to-slate-900 dark:from-[#162028] dark:to-[#0f161b] rounded-2xl p-5 text-white shadow-lg border border-slate-700 relative overflow-hidden flex flex-col h-full">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>

            <div className="flex justify-between items-start mb-3 relative z-10 shrink-0">
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-1">
                  {t("dashboard.current_plan", "Tu Plan Actual")}
                </p>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  {data?.plan?.name || t("dashboard.starter", "Starter")}
                  <StatusBadge
                    status={data?.plan?.status}
                    isActive={isPlanActive}
                  />
                </h3>
                {data?.plan?.price !== undefined && data.plan.price > 0 && (
                  <p className="text-emerald-400 text-xs font-semibold mt-0.5">
                    ${data.plan.price.toLocaleString()}/mes
                  </p>
                )}
              </div>
              <Shield className="w-5 h-5 text-emerald-400" />
            </div>

            {data?.plan?.features && data.plan.features.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3 shrink-0 relative z-10">
                {data.plan.features.map((feat, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold border ${feat.enabled ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"}`}
                  >
                    {feat.enabled ? (
                      <Check className="w-2.5 h-2.5" />
                    ) : (
                      <X className="w-2.5 h-2.5" />
                    )}
                    {feat.label}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 relative z-10 overflow-y-auto custom-scrollbar flex-1 pr-1 max-h-[200px]">
              {data?.plan?.usage?.map((metric, idx) => {
                const pct = getUsagePercent(metric.used, metric.limit);
                return (
                  <div key={idx}>
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span className="text-slate-300">{metric.label}</span>
                      <span
                        className={`font-mono ${metric.limit !== -1 && pct > 75 ? getUsageTextColor(pct) : "text-white opacity-80"}`}
                      >
                        {metric.used.toLocaleString()} /{" "}
                        {metric.limit === -1
                          ? "∞"
                          : metric.limit.toLocaleString()}{" "}
                        <span className="text-[9px] opacity-50 ml-0.5">
                          {metric.unit}
                        </span>
                      </span>
                    </div>
                    <div className="h-1 bg-slate-700/50 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${getUsageColor(pct)}`}
                        style={{
                          width:
                            metric.limit === -1 ? "5%" : `${Math.max(pct, 2)}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                );
              }) || (
                <div className="text-sm text-slate-500 italic">
                  {t("dashboard.loading_metrics", "Cargando métricas...")}
                </div>
              )}
            </div>

            <div className="mt-3 pt-2 border-t border-slate-700/50 flex items-center justify-between text-[10px] text-slate-400 shrink-0">
              <span>
                {data?.plan?.trialEndsAt ? (
                  <>
                    {t("dashboard.trial_until", "Prueba hasta:")}{" "}
                    <strong className="text-amber-400 ml-1">
                      {new Date(data.plan.trialEndsAt).toLocaleDateString(
                        i18n.language,
                        { month: "short", day: "numeric", year: "numeric" },
                      )}
                    </strong>
                  </>
                ) : data?.plan?.expiresAt ? (
                  <>
                    {t("dashboard.renews", "Renueva:")}{" "}
                    <strong className="text-white ml-1">
                      {new Date(data.plan.expiresAt).toLocaleDateString(
                        i18n.language,
                        { month: "short", day: "numeric", year: "numeric" },
                      )}
                    </strong>
                  </>
                ) : (
                  <>{t("dashboard.no_expiry", "Sin caducidad")}</>
                )}
              </span>
              <button
                onClick={() => onNavigate?.("settings")}
                className="text-emerald-400 hover:text-emerald-300 transition-colors font-medium cursor-pointer text-[10px] uppercase tracking-wide flex items-center gap-1"
              >
                {t("dashboard.manage", "Gestionar")} <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="lg:col-span-2 flex flex-col gap-4 sm:gap-6">
            <div className="h-[360px]">
              <SalesFunnelWidget data={data?.salesFunnel} />
            </div>

            <div className="h-[360px]">
              <ActiveLoadChart data={data?.agentWorkload} />
            </div>
          </div>
          <div className="flex flex-col gap-4 sm:gap-6">
            <div className="h-[360px]">
              <ChannelDistributionWidget channels={data?.channelDistribution} />
            </div>

            <div className="h-[360px]">
              <AgentLeaderboardWidget agents={data?.topAgents} />
            </div>
          </div>
        </div>

        <div className="flex flex-col h-[550px]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
              {t("dashboard.tickets_in_progress", "Gestión de Tickets en Curso")}
            </h2>
            <div className="flex gap-2 text-sm text-slate-500 dark:text-slate-400">
               {t("dashboard.quick_view_load", "Vista rápida de la carga actual del equipo")}
            </div>
          </div>

          <div className="flex-1 bg-slate-100 dark:bg-[#162028] rounded-xl border border-slate-200 dark:border-reply-border-dark overflow-hidden shadow-inner">
            <TicketsKanbanView />
          </div>
        </div>
      </div>
    </div>
  );
};
