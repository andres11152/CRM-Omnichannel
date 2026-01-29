import React, { useState, useEffect } from "react";
import { Plan, Company, User, UserRole } from "../types";
import { adminService } from "../services/adminService";
import { API_BASE_URL } from "../services/apiConfig";
import { TicketsKanbanView } from "./TicketsKanbanView";
import { ModuleHeader } from "./common/ModuleHeader";
import {
  StatCard,
  MrrTrendModule,
  PlanDistributionModule,
  SystemStatusModule,
  TopTenantsModule,
  RecentActivityModule,
} from "./DashboardWidgets";
import { updateUserPreferences } from "../services/userService";
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
} from "lucide-react";
import { ActivityFeed, ActivityItem } from "./dashboard/ActivityFeed";
import {
  TenantHealthWidget,
  TenantHealth,
} from "./dashboard/TenantHealthWidget";
import { api } from "../src/lib/axios";

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

  return (
    <CompanyAdminDashboard
      onNavigate={onNavigate}
      user={user}
      onUserUpdate={onUserUpdate}
    />
  );
};

// --- MASTER ADMIN DASHBOARD (PROFESSIONAL SaaS Style) ---
const MasterAdminDashboard: React.FC<{ onNavigate?: (tab: any) => void }> = ({
  onNavigate,
}) => {
  const [stats, setStats] = useState({
    totalCompanies: 0,
    activeCompanies: 0,
    totalRevenue: 0,
    activeUsers: 0,
    systemHealth: "100%",
  });
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);

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
      let newStats: any = { ...stats };

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
        newStats.financials = financials;
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
    <div className="h-full flex flex-col bg-gray-50 dark:bg-[#0a0e14] overflow-hidden">
      <ModuleHeader
        title="Panel de Control Master"
        description="Administración y monitoreo del sistema CRM SaaS"
        icon={<BarChart3 className="w-8 h-8 text-white" />}
        gradient="from-purple-600 via-indigo-600 to-blue-600 dark:from-purple-900 dark:via-indigo-900 dark:to-blue-900"
        stats={{
          label: "Empresas Activas",
          value: stats.activeCompanies,
        }}
      />

      <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
        {/* KPIs Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <StatCard
            title="Total Empresas"
            value={stats.totalCompanies}
            icon={<Building2 className="w-6 h-6" />}
            color="text-blue-600 dark:text-blue-400"
            bg="bg-blue-50 dark:bg-blue-900/30"
            isLoading={loading}
          />
          <StatCard
            title="Empresas Activas"
            value={stats.activeCompanies}
            icon={<Zap className="w-6 h-6" />}
            color="text-green-600 dark:text-green-400"
            bg="bg-green-50 dark:bg-green-900/30"
            isLoading={loading}
          />
          <StatCard
            title="MRR Total"
            value={`$${((stats as any).financials?.mrr || 0).toLocaleString()}`}
            icon={<TrendingUp className="w-6 h-6" />}
            color="text-purple-600 dark:text-purple-400"
            bg="bg-purple-50 dark:bg-purple-900/30"
            isLoading={loading}
          />
          <StatCard
            title="Usuarios Activos"
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
            <MrrTrendModule data={(stats as any).financials?.trend || []} />
          </div>
          <div>
            <PlanDistributionModule
              data={(stats as any).financials?.distribution || []}
            />
          </div>
        </div>

        {/* Secondary Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <div>
              <div className="bg-white dark:bg-[#1e293b] p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 h-[400px] flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-500" />
                    Salud de Cartera (Churn Risk)
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
            <SystemStatusModule data={(stats as any).systemStatus} />
          </div>
          <div>
            <div className="bg-white dark:bg-[#1e293b] p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 h-[400px] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-indigo-500" />
                  Actividad Global
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
        <div className="mt-6 bg-white dark:bg-[#1e293b] rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Acciones Rápidas
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => onNavigate?.("tenants")}
              className="group flex items-center justify-between p-4 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md transition-all text-left bg-white dark:bg-slate-800"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">
                    Gestión de Empresas
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Administrar clientes
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
              className="group flex items-center justify-between p-4 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-purple-500 dark:hover:border-purple-500 hover:shadow-md transition-all text-left bg-white dark:bg-slate-800"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <DollarSign className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">
                    Gestión de Planes
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Configurar suscripciones
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
              onClick={() => onNavigate?.("schema")}
              className="group flex items-center justify-between p-4 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-teal-500 dark:hover:border-teal-500 hover:shadow-md transition-all text-left bg-white dark:bg-slate-800"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <BarChart3 className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">
                    Base de Datos
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Visualizar esquema
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

interface DashboardData {
  metrics: DashboardMetrics;
  plan: {
    name: string;
    usage: UsageMetric[];
    features?: PlanFeature[];
    expiresAt?: string;
    status?: string;
    isActive?: boolean;
  };
}

// --- COMPANY ADMIN DASHBOARD (ENTERPRISE - REDESIGNED) ---
const CompanyAdminDashboard: React.FC<{
  onNavigate?: (tab: string) => void;
  user?: User;
  onUserUpdate?: (user: Partial<User>) => void;
}> = ({ onNavigate, user, onUserUpdate }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

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

  // Helper to calculate usage percentage
  const getUsagePercent = (used: number, limit: number) => {
    if (limit === -1) return 0; // Infinite
    return Math.min((used / limit) * 100, 100);
  };

  // Helper to determine active status safely
  const isPlanActive =
    data?.plan?.isActive ??
    (data?.plan?.status === "ACTIVE" || data?.plan?.status === "TRIAL");

  // Dynamic Date
  const todayDate = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-[#0b141a] overflow-hidden font-sans">
      {/* 1. PROFESSIONAL HEADER */}
      <div className="bg-white dark:bg-[#111b21] border-b border-slate-200 dark:border-slate-800 px-8 py-6 shadow-sm z-10">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight mb-1">
              Panel de Control
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Bienvenido,{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {user?.name}
              </span>
              . Aquí tienes la visión general de tu negocio.
            </p>
          </div>
          <div className="text-right">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700">
              <Activity className="w-4 h-4 text-blue-500 animate-pulse" />
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300 capitalize">
                {todayDate}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        {/* 2. TOP METRICS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {/* Active Tickets */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-lg shadow-blue-900/20 relative overflow-hidden group hover:shadow-xl transition-all">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-500">
              <MessageSquare className="w-24 h-24 text-white" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2 opacity-90">
                <MessageSquare className="w-5 h-5" />
                <span className="text-sm font-medium uppercase tracking-wide">
                  Tickets Activos
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold">
                  {loading ? "-" : data?.metrics?.activeTickets || 0}
                </span>
                <span className="text-sm opacity-80">pendientes</span>
              </div>
              <div className="mt-4 pt-4 border-t border-white/20 flex items-center justify-between">
                <span className="text-xs font-medium bg-white/20 px-2 py-1 rounded">
                  En tiempo real
                </span>
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>

          {/* Response Time */}
          <div className="bg-white dark:bg-[#1f2c34] rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm hover:border-amber-400/50 transition-colors group">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-amber-600 dark:text-amber-400">
                <TrendingUp className="w-6 h-6" />
              </div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                KPI
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                Tiempo Respuesta
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-bold text-slate-900 dark:text-white">
                  {loading ? "..." : data?.metrics?.avgResponseTime || "0m"}
                </span>
              </div>
              <p className="text-xs text-emerald-500 flex items-center gap-1 mt-2 font-medium">
                <TrendingDown className="w-3 h-3" />
                12% vs semana pasada
              </p>
            </div>
          </div>

          {/* AI Efficiency */}
          <div className="bg-white dark:bg-[#1f2c34] rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm hover:border-purple-400/50 transition-colors group">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl text-purple-600 dark:text-purple-400">
                <Zap className="w-6 h-6" />
              </div>
              <span className="text-xs font-semibold text-purple-200 bg-purple-600 px-2 py-0.5 rounded-full">
                BETA
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                Resolución IA
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-bold text-slate-900 dark:text-white">
                  {loading ? "..." : data?.metrics?.aiResolution || "0%"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Tickets cerrados automáticamente
              </p>
            </div>
          </div>

          {/* PLAN & USAGE CARD (REQUESTED FEATURE) */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 dark:from-[#162028] dark:to-[#0f161b] rounded-2xl p-6 text-white shadow-lg border border-slate-700 relative overflow-hidden flex flex-col h-full">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>

            <div className="flex justify-between items-start mb-4 relative z-10 shrink-0">
              <div>
                <p className="text-slate-400 text-xs uppercase font-bold tracking-wider mb-1">
                  Tu Plan Actual
                </p>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  {data?.plan?.name || "Starter"}
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${isPlanActive ? "bg-emerald-500" : "bg-rose-500"}`}
                  >
                    {isPlanActive ? "Activo" : "Inactivo"}
                  </span>
                </h3>
              </div>
              <Shield className="w-5 h-5 text-emerald-400" />
            </div>

            {/* FEATURES BADGES */}
            {data?.plan?.features && (
              <div className="flex flex-wrap gap-2 mb-4 shrink-0 relative z-10">
                {data.plan.features.map((feat, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] uppercase font-bold border ${feat.enabled ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"}`}
                  >
                    {feat.enabled ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <X className="w-3 h-3" />
                    )}
                    {feat.label}
                  </div>
                ))}
              </div>
            )}

            {/* Usage Bars - SCROLLABLE LIST */}
            <div className="space-y-3 relative z-10 overflow-y-auto custom-scrollbar flex-1 pr-1 max-h-[160px]">
              {data?.plan?.usage?.map((metric, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">{metric.label}</span>
                    <span className="text-white font-mono opacity-80">
                      {metric.used.toLocaleString()} /{" "}
                      {metric.limit === -1
                        ? "∞"
                        : metric.limit.toLocaleString()}{" "}
                      <span className="text-[10px] opacity-50 ml-0.5">
                        {metric.unit}
                      </span>
                    </span>
                  </div>
                  <div className="h-1 bg-slate-700/50 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        getUsagePercent(metric.used, metric.limit) > 90
                          ? "bg-rose-500"
                          : getUsagePercent(metric.used, metric.limit) > 75
                            ? "bg-amber-400"
                            : "bg-emerald-500"
                      }`}
                      style={{
                        width: `${getUsagePercent(metric.used, metric.limit)}%`,
                      }}
                    ></div>
                  </div>
                </div>
              )) || (
                <div className="text-sm text-slate-500 italic">
                  Cargando métricas...
                </div>
              )}
            </div>

            {/* Renewal Date (Real Data) */}
            <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between text-xs text-slate-400 shrink-0">
              <span>
                {data?.plan?.expiresAt ? (
                  <>
                    Renueva:{" "}
                    <strong className="text-white ml-1">
                      {new Date(data.plan.expiresAt).toLocaleDateString(
                        "es-ES",
                        { month: "short", day: "numeric", year: "numeric" },
                      )}
                    </strong>
                  </>
                ) : (
                  <>Sin caducidad</>
                )}
              </span>
              {/* Redirect to Settings instead of Billing (Master Only) */}
              <button
                onClick={() => onNavigate?.("settings")}
                className="text-emerald-400 hover:text-emerald-300 transition-colors font-medium cursor-pointer text-[10px] uppercase tracking-wide flex items-center gap-1"
              >
                Gestionar <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* 3. MAIN WORKSPACE (KANBAN) */}
        <div className="flex flex-col h-[650px] min-h-[650px]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
              Gestión de Tickets en Curso
            </h2>
            <div className="flex gap-2">{/* View Toggles could go here */}</div>
          </div>

          <div className="flex-1 bg-slate-100 dark:bg-[#162028] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-inner">
            <TicketsKanbanView />
          </div>
        </div>
      </div>
    </div>
  );
};
