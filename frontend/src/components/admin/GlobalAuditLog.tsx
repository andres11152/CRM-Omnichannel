import React, { useState, useEffect } from "react";
import { 
  Shield, 
  Search, 
  Filter, 
  Building2, 
  Database,
  History,
  Info,
  Clock,
  Terminal,
  ChevronLeft,
  ChevronRight,
  Download,
  User,
  Calendar
} from "lucide-react";
import { auditService, AuditLog, AuditFilter } from "@/services/auditService";
import { ModuleHeader } from "@/components/common/ModuleHeader";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const GlobalAuditLog: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AuditFilter>({
    limit: 20,
    offset: 0
  });

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await auditService.getGlobalLogs(filter);
      setLogs(data.logs);
      setTotal(data.total);
    } catch (error) {
      console.error("Failed to fetch audit logs", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filter]);

  const getActionColor = (action: string) => {
    const a = action.toUpperCase();
    if (a.includes("CREATE")) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    if (a.includes("DELETE")) return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
    if (a.includes("UPDATE")) return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    if (a.includes("LOGIN")) return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20";
    return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
  };

  return (
    <div className="flex flex-col h-full bg-reply-bg dark:bg-reply-bg-dark animate-in fade-in duration-500 overflow-hidden">
      <ModuleHeader
        title="Forensics & Audit Log"
        description="Trazabilidad total de operaciones y eventos de seguridad multi-tenant"
        icon={<History className="w-8 h-8 text-white" />}
        gradient="from-indigo-600 via-blue-700 to-slate-900 dark:from-indigo-900 dark:via-blue-900 dark:to-black"
        stats={{
          label: "Total Registros",
          value: total.toLocaleString()
        }}
        action={
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-xl text-white text-sm font-bold transition-all active:scale-95">
              <Download className="w-4 h-4" />
              Exportar Forense
            </button>
          </div>
        }
      />

      <div className="flex-1 p-6 overflow-y-auto custom-scrollbar space-y-6">
        {/* Filters Bar */}
        <div className="bg-white dark:bg-reply-panel-dark p-5 rounded-2xl border border-slate-200 dark:border-reply-border-dark shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar entidad..." 
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none text-slate-700 dark:text-slate-200"
              onChange={(e) => setFilter(f => ({ ...f, entity: e.target.value || undefined, offset: 0 }))}
            />
          </div>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Filtrar por Tenant ID..." 
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none text-slate-700 dark:text-slate-200"
              onChange={(e) => setFilter(f => ({ ...f, companyId: e.target.value || undefined, offset: 0 }))}
            />
          </div>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Filtrar por Usuario..." 
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none text-slate-700 dark:text-slate-200"
              onChange={(e) => setFilter(f => ({ ...f, userId: e.target.value || undefined, offset: 0 }))}
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select 
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none text-slate-700 dark:text-slate-200 appearance-none font-medium"
              onChange={(e) => setFilter(f => ({ ...f, action: e.target.value || undefined, offset: 0 }))}
            >
              <option value="">Todas las acciones</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="LOGIN">LOGIN</option>
              <option value="IMPERSONATE">IMPERSONATE</option>
            </select>
          </div>
        </div>

        {/* Logs Table Container */}
        <div className="bg-white dark:bg-reply-panel-dark rounded-2xl border border-slate-200 dark:border-reply-border-dark shadow-sm overflow-hidden flex flex-col min-h-[500px]">
          <div className="p-6 border-b border-slate-100 dark:border-reply-border-dark flex items-center justify-between bg-slate-50/50 dark:bg-white/5">
            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Terminal className="w-5 h-5 text-indigo-500" />
              Event Stream
            </h3>
            <div className="flex items-center gap-4">
              <span className="text-xs font-medium text-slate-400">Página {Math.floor((filter.offset || 0) / (filter.limit || 20)) + 1} de {Math.ceil(total / (filter.limit || 20)) || 1}</span>
              <div className="flex items-center gap-1">
                <button 
                  disabled={filter.offset === 0}
                  onClick={() => setFilter(f => ({ ...f, offset: Math.max(0, (f.offset || 0) - (f.limit || 20)) }))}
                  className="p-1.5 disabled:opacity-30 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg transition-all"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button 
                  disabled={(filter.offset || 0) + (filter.limit || 20) >= total}
                  onClick={() => setFilter(f => ({ ...f, offset: (f.offset || 0) + (f.limit || 20) }))}
                  className="p-1.5 disabled:opacity-30 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg transition-all"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50/30 dark:bg-black/20 border-b border-slate-100 dark:border-reply-border-dark text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">Tenant</th>
                  <th className="px-6 py-4">Operador</th>
                  <th className="px-6 py-4">Acción</th>
                  <th className="px-6 py-4">Entidad</th>
                  <th className="px-6 py-4">Detalles</th>
                  <th className="px-6 py-4 text-right">Red / IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-reply-border-dark">
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="h-10 bg-slate-100 dark:bg-white/5 rounded-lg w-full"></div>
                      </td>
                    </tr>
                  ))
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center gap-3 text-slate-400">
                        <Terminal className="w-12 h-12 opacity-20" />
                        <p className="font-medium">No se encontraron registros de auditoría</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-mono text-xs">
                          <Clock className="w-3.5 h-3.5" />
                          {format(new Date(log.createdAt), "HH:mm:ss", { locale: es })}
                          <span className="opacity-50 ml-1">
                            {format(new Date(log.createdAt), "dd MMM", { locale: es })}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-slate-400" />
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{log.companyName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">{log.userName}</span>
                          <span className="text-[9px] text-slate-500 dark:text-slate-500 font-mono">ID: {log.userId?.substring(0, 8)}...</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${getActionColor(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-xs text-slate-600 dark:text-slate-300 font-mono">
                            {log.entity} <span className="opacity-40">#{log.entityId.substring(0, 6)}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <button className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold">
                          <Info className="w-3.5 h-3.5" />
                          Ver Payload
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex flex-col items-end">
                          <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400">{log.ipAddress || "Internal"}</span>
                          <span className="text-[9px] text-slate-400 truncate max-w-[120px]">{log.userAgent?.substring(0, 30)}...</span>
                        </div>
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
