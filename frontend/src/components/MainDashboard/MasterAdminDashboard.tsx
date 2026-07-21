import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Company } from "@/types";
import { adminService } from "@/services/adminService";
import { ModuleHeader } from "../common/ModuleHeader";
import {
  StatCard,
  MrrTrendModule,
  PlanDistributionModule,
  SystemStatusModule,
} from "../DashboardWidgets";
import { Skeleton } from "boneyard-js/react";
import { Zap, TrendingUp, BarChart3, Building2, Users, DollarSign, Activity, Shield } from "lucide-react";
import { ActivityFeed, ActivityItem } from "../dashboard/ActivityFeed";
import { TenantHealthWidget, TenantHealth } from "../dashboard/TenantHealthWidget";
import { api } from "@/lib/axios";
import { getModuleCache, setModuleCache } from "@/lib/moduleCache";

interface MasterStats {
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
}

interface MasterDashboardCache {
  stats: MasterStats;
  companies: Company[];
  activity: ActivityItem[];
  tenantHealth: TenantHealth[];
}

const MASTER_DASH_CACHE_KEY = "dashboard:master";

export const MasterAdminDashboard: React.FC<{
  onNavigate?: (tab: string) => void;
}> = ({ onNavigate }) => {
  // Stale-while-revalidate: instant render on module re-entry, silent refetch
  const cachedDash = getModuleCache<MasterDashboardCache>(MASTER_DASH_CACHE_KEY);
  const [stats, setStats] = useState<MasterStats>(
    cachedDash?.stats ?? {
      totalCompanies: 0,
      activeCompanies: 0,
      totalRevenue: 0,
      activeUsers: 0,
      systemHealth: "100%",
    },
  );
  const [loading, setLoading] = useState(!cachedDash);
  const [companies, setCompanies] = useState<Company[]>(cachedDash?.companies ?? []);
  const { t } = useTranslation();

  const [activity, setActivity] = useState<ActivityItem[]>(cachedDash?.activity ?? []);
  const [tenantHealth, setTenantHealth] = useState<TenantHealth[]>(
    cachedDash?.tenantHealth ?? [],
  );

  // Mirror rendered data into the module cache once real data is in
  useEffect(() => {
    if (!loading) {
      setModuleCache<MasterDashboardCache>(MASTER_DASH_CACHE_KEY, {
        stats,
        companies,
        activity,
        tenantHealth,
      });
    }
  }, [loading, stats, companies, activity, tenantHealth]);

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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
        </Skeleton>
      </div>
    </div>
  );
};
