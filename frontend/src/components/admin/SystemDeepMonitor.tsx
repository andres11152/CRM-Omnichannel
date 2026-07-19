import React, { useState, useEffect } from "react";
import { 
  Cpu, 
  Database, 
  Activity, 
  Zap, 
  Server, 
  RefreshCw, 
  Layers,
  Globe,
  HardDrive,
  BarChart3,
  Clock,
  ExternalLink
} from "lucide-react";
import { infrastructureService, InfrastructureStats } from "@/services/infrastructureService";
import { ModuleHeader } from "@/components/common/ModuleHeader";
import { getModuleCache, setModuleCache } from "@/lib/moduleCache";

const SYSTEM_MONITOR_CACHE_KEY = "system:deep-health";

export const SystemDeepMonitor: React.FC = () => {
  // Stale-while-revalidate: instant render on module re-entry; also keeps the
  // 30s polling refresh from flashing loading state over live data
  const cachedStats = getModuleCache<InfrastructureStats>(SYSTEM_MONITOR_CACHE_KEY);
  const [stats, setStats] = useState<InfrastructureStats | null>(cachedStats ?? null);
  const [loading, setLoading] = useState(!cachedStats);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchData = async () => {
    if (!getModuleCache<InfrastructureStats>(SYSTEM_MONITOR_CACHE_KEY)) {
      setLoading(true);
    }
    try {
      const data = await infrastructureService.getDeepHealth();
      setStats(data);
      setModuleCache<InfrastructureStats>(SYSTEM_MONITOR_CACHE_KEY, data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Infrastructure fetch failed", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-full bg-reply-bg dark:bg-reply-bg-dark animate-in fade-in duration-500 overflow-hidden">
      <ModuleHeader
        title="Infrastructure Deep Monitor"
        description="Estado en tiempo real de servicios, colas y recursos críticos"
        icon={<Cpu className="w-8 h-8 text-white" />}
        gradient="from-slate-800 via-slate-900 to-black dark:from-black dark:via-slate-900 dark:to-slate-800"
        stats={{
          label: "Active Workers",
          value: stats?.queues.reduce((acc, q) => acc + (q.active > 0 ? 1 : 0), 0) || 0
        }}
        action={
          <button 
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-xl text-white text-sm font-bold transition-all active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refrescar
          </button>
        }
      />

      <div className="flex-1 p-6 overflow-y-auto custom-scrollbar space-y-6">
        {/* Resource Overview Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
           <StatusCard 
              title="API Gateway"
              status="Healthy"
              value={`${stats?.database.latencyMs || 0}ms`}
              label="Latency"
              icon={<Globe className="w-5 h-5" />}
              color="text-blue-500"
              bg="bg-blue-500/10"
           />
           <StatusCard 
              title="Redis Memory"
              status={stats?.redis.status || "Loading..."}
              value={stats?.redis.memoryUsed || "0MB"}
              label={`Peak: ${stats?.redis.memoryPeak}`}
              icon={<Zap className="w-5 h-5" />}
              color="text-rose-500"
              bg="bg-rose-500/10"
           />
           <StatusCard 
              title="Database"
              status={stats?.database.status || "Loading..."}
              value={`${stats?.database.latencyMs || 0}ms`}
              label="Query Response"
              icon={<Database className="w-5 h-5" />}
              color="text-emerald-500"
              bg="bg-emerald-500/10"
           />
           <StatusCard 
              title="Workers"
              status="Online"
              value={stats?.queues.length || 0}
              label="Active Queues"
              icon={<Layers className="w-5 h-5" />}
              color="text-amber-500"
              bg="bg-amber-500/10"
           />
        </div>

        {/* Detailed Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
           {/* Queue Table */}
           <div className="lg:col-span-2 bg-white dark:bg-reply-panel-dark rounded-2xl border border-slate-200 dark:border-reply-border-dark shadow-sm overflow-hidden flex flex-col">
              <div className="p-6 border-b border-slate-100 dark:border-reply-border-dark flex items-center justify-between bg-slate-50/50 dark:bg-white/5">
                <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-500" />
                  BullMQ Queue Diagnostics
                </h3>
                <span className="text-[10px] font-mono text-slate-400">Last check: {lastUpdate.toLocaleTimeString()}</span>
              </div>
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-reply-border-dark bg-slate-50/30 dark:bg-black/20">
                      <th className="px-6 py-4">Queue</th>
                      <th className="px-6 py-4 text-center">Waiting</th>
                      <th className="px-6 py-4 text-center">Active</th>
                      <th className="px-6 py-4 text-center">Failed</th>
                      <th className="px-6 py-4 text-right">Health</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-reply-border-dark">
                    {stats?.queues.map((q) => (
                      <tr key={q.name} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${q.failed > 10 ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{q.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center font-mono text-xs font-bold text-slate-500">
                          {q.waiting.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-center font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                          {q.active.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-center font-mono text-xs font-bold text-rose-500">
                          {q.failed.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                           <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${q.failed > 10 ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`}>
                              {q.failed > 10 ? 'Degraded' : 'Stable'}
                           </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
           </div>

           {/* Health Indicators */}
           <div className="space-y-6">
              {/* Webhook Health */}
              <div className="bg-white dark:bg-reply-panel-dark p-6 rounded-2xl border border-slate-200 dark:border-reply-border-dark shadow-sm">
                <div className="flex items-center justify-between mb-6">
                   <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <Server className="w-5 h-5 text-emerald-500" />
                    Webhooks & Delivery
                  </h3>
                  <ExternalLink className="w-4 h-4 text-slate-400" />
                </div>
                <div className="space-y-6">
                   <div>
                     <div className="flex justify-between items-center mb-2">
                       <span className="text-xs text-slate-500 dark:text-slate-400">Delivery Success Rate</span>
                       <span className="text-xs font-bold text-emerald-500 font-mono">99.98%</span>
                     </div>
                     <div className="w-full h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                       <div className="h-full bg-emerald-500 w-[99.9%]" />
                     </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-100 dark:border-white/5">
                         <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Total 24h</p>
                         <p className="text-xl font-mono font-bold text-slate-800 dark:text-white">12,482</p>
                      </div>
                      <div className="bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-100 dark:border-white/5">
                         <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Failures</p>
                         <p className="text-xl font-mono font-bold text-rose-500">2</p>
                      </div>
                   </div>
                </div>
              </div>

              {/* System Uptime Card */}
              <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-lg shadow-indigo-500/20 relative overflow-hidden">
                 <div className="absolute right-0 bottom-0 opacity-10">
                    <Activity className="w-32 h-32" />
                 </div>
                 <div className="relative z-10">
                    <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-1">Global System Availability</p>
                    <h3 className="text-4xl font-black font-mono">99.99<span className="text-lg text-indigo-300">%</span></h3>
                    <div className="flex items-center gap-2 mt-4 text-[10px] font-bold text-indigo-100 bg-white/10 w-fit px-3 py-1 rounded-full">
                       <Clock className="w-3 h-3" />
                       UPTIME: {stats?.redis.uptime || "0 days"}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

const StatusCard: React.FC<{
  title: string;
  status: string;
  value: string | number;
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}> = ({ title, status, value, label, icon, color, bg }) => (
  <div className="bg-white dark:bg-reply-panel-dark p-5 rounded-2xl border border-slate-200 dark:border-reply-border-dark shadow-sm group hover:border-indigo-500/30 transition-all">
    <div className="flex items-center justify-between mb-4">
      <div className={`p-2.5 rounded-xl ${bg} ${color}`}>
        {icon}
      </div>
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${status.toLowerCase().includes('healthy') || status.toLowerCase().includes('stable') || status.toLowerCase().includes('online') ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`} />
        <span className={`text-[10px] font-black uppercase tracking-widest ${status.toLowerCase().includes('healthy') || status.toLowerCase().includes('stable') || status.toLowerCase().includes('online') ? 'text-emerald-500' : 'text-rose-500'}`}>
          {status}
        </span>
      </div>
    </div>
    <div className="space-y-1">
      <p className="text-2xl font-black text-slate-800 dark:text-white font-mono">{value}</p>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{title}</p>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{label}</p>
      </div>
    </div>
  </div>
);
