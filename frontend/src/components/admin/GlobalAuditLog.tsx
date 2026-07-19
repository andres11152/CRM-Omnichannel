import React, { useState, useEffect } from "react";
import { 
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
  Search,
  Filter
} from "lucide-react";
import { auditService, AuditLog, AuditFilter } from "@/services/auditService";
import { ModuleHeader } from "@/components/common/ModuleHeader";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Modal } from "@/components/ui/Modal";
import { getModuleCache, setModuleCache } from "@/lib/moduleCache";

interface AuditLogCache {
  logs: AuditLog[];
  total: number;
}

const AUDIT_LOG_CACHE_KEY = "audit:default-view";
const DEFAULT_FILTER: AuditFilter = { limit: 20, offset: 0 };

export const GlobalAuditLog: React.FC = () => {
  // Stale-while-revalidate: re-entering the module on the default (first
  // page, no filters) view renders instantly and refetches silently.
  const cachedAudit = getModuleCache<AuditLogCache>(AUDIT_LOG_CACHE_KEY);
  const [logs, setLogs] = useState<AuditLog[]>(cachedAudit?.logs ?? []);
  const [total, setTotal] = useState(cachedAudit?.total ?? 0);
  const [loading, setLoading] = useState(!cachedAudit);
  const [filter, setFilter] = useState<AuditFilter>(DEFAULT_FILTER);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async () => {
    const isDefaultView = JSON.stringify(filter) === JSON.stringify(DEFAULT_FILTER);
    if (!(isDefaultView && getModuleCache<AuditLogCache>(AUDIT_LOG_CACHE_KEY))) {
      setLoading(true);
    }
    try {
      const data = await auditService.getGlobalLogs(filter);
      setLogs(data.logs);
      setTotal(data.total);
      if (isDefaultView) {
        setModuleCache<AuditLogCache>(AUDIT_LOG_CACHE_KEY, { logs: data.logs, total: data.total });
      }
    } catch (error) {
      console.error("Failed to fetch audit logs", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filter]);

  const getBadgeVariant = (action: string): "success" | "warning" | "error" | "info" | "neutral" => {
    const a = action.toUpperCase();
    if (a.includes("CREATE")) return "success";
    if (a.includes("DELETE")) return "error";
    if (a.includes("UPDATE")) return "warning";
    if (a.includes("LOGIN")) return "info";
    return "neutral";
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
            <Button 
              variant="secondary"
              className="bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white font-bold transition-all active:scale-95"
            >
              <Download className="w-4 h-4" />
              Exportar Forense
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-6 overflow-y-auto custom-scrollbar space-y-6">
        {/* Filters Bar */}
        <Card className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
          <Input 
            icon={<Search className="w-4 h-4 text-reply-text-secondary/60" />}
            placeholder="Buscar entidad..." 
            onChange={(e) => setFilter(f => ({ ...f, entity: e.target.value || undefined, offset: 0 }))}
          />
          <Input 
            icon={<Building2 className="w-4 h-4 text-reply-text-secondary/60" />}
            placeholder="Filtrar por Tenant ID..." 
            onChange={(e) => setFilter(f => ({ ...f, companyId: e.target.value || undefined, offset: 0 }))}
          />
          <Input 
            icon={<User className="w-4 h-4 text-reply-text-secondary/60" />}
            placeholder="Filtrar por Usuario..." 
            onChange={(e) => setFilter(f => ({ ...f, userId: e.target.value || undefined, offset: 0 }))}
          />
          <div className="relative group w-full">
            {/* Unified Filter Selector */}
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-reply-text-secondary/60 group-focus-within:text-reply-brand transition-colors pointer-events-none z-10">
              <Filter className="w-4 h-4" />
            </div>
            <select 
              className="w-full pl-10 pr-10 py-2.5 bg-reply-bg/20 dark:bg-white/5 border border-reply-border dark:border-reply-border-dark rounded-xl text-sm focus:ring-4 focus:ring-reply-brand/10 focus:border-reply-brand transition-all outline-none text-reply-text-primary dark:text-reply-text-primary-dark appearance-none font-medium cursor-pointer"
              onChange={(e) => setFilter(f => ({ ...f, action: e.target.value || undefined, offset: 0 }))}
            >
              <option value="" className="bg-white dark:bg-reply-panel-dark text-reply-text-primary dark:text-reply-text-primary-dark">Todas las acciones</option>
              <option value="CREATE" className="bg-white dark:bg-reply-panel-dark text-reply-text-primary dark:text-reply-text-primary-dark">CREATE</option>
              <option value="UPDATE" className="bg-white dark:bg-reply-panel-dark text-reply-text-primary dark:text-reply-text-primary-dark">UPDATE</option>
              <option value="DELETE" className="bg-white dark:bg-reply-panel-dark text-reply-text-primary dark:text-reply-text-primary-dark">DELETE</option>
              <option value="LOGIN" className="bg-white dark:bg-reply-panel-dark text-reply-text-primary dark:text-reply-text-primary-dark">LOGIN</option>
              <option value="IMPERSONATE" className="bg-white dark:bg-reply-panel-dark text-reply-text-primary dark:text-reply-text-primary-dark">IMPERSONATE</option>
            </select>
            <ChevronRight className="w-4 h-4 absolute right-4 top-1/2 transform -translate-y-1/2 rotate-90 text-reply-text-secondary/60 pointer-events-none" />
          </div>
        </Card>

        {/* Logs Table Container */}
        <Card className="flex flex-col min-h-[500px]">
          <div className="p-6 border-b border-reply-border dark:border-reply-border-dark flex items-center justify-between bg-slate-50/20 dark:bg-white/5">
            <h3 className="font-bold text-reply-text-primary dark:text-reply-text-primary-dark flex items-center gap-2">
              <Terminal className="w-5 h-5 text-reply-brand" />
              Event Stream
            </h3>
            <div className="flex items-center gap-4">
              <span className="text-xs font-semibold text-reply-text-secondary dark:text-reply-text-secondary-dark">
                Página {Math.floor((filter.offset || 0) / (filter.limit || 20)) + 1} de {Math.ceil(total / (filter.limit || 20)) || 1}
              </span>
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost"
                  size="sm"
                  disabled={filter.offset === 0}
                  onClick={() => setFilter(f => ({ ...f, offset: Math.max(0, (f.offset || 0) - (f.limit || 20)) }))}
                  className="p-1.5 min-w-[32px] h-8"
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <Button 
                  variant="ghost"
                  size="sm"
                  disabled={(filter.offset || 0) + (filter.limit || 20) >= total}
                  onClick={() => setFilter(f => ({ ...f, offset: (f.offset || 0) + (f.limit || 20) }))}
                  className="p-1.5 min-w-[32px] h-8"
                >
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50/30 dark:bg-black/20 border-b border-reply-border dark:border-reply-border-dark text-[10px] font-black text-reply-text-secondary dark:text-reply-text-secondary-dark uppercase tracking-widest">
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">Tenant</th>
                  <th className="px-6 py-4">Operador</th>
                  <th className="px-6 py-4">Acción</th>
                  <th className="px-6 py-4">Entidad</th>
                  <th className="px-6 py-4">Detalles</th>
                  <th className="px-6 py-4 text-right">Red / IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-reply-border dark:divide-reply-border-dark">
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="h-10 bg-reply-bg/50 dark:bg-white/5 rounded-lg w-full"></div>
                      </td>
                    </tr>
                  ))
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center gap-3 text-reply-text-secondary/60">
                        <Terminal className="w-12 h-12 opacity-20" />
                        <p className="font-semibold text-sm">No se encontraron registros de auditoría</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-reply-bg/10 dark:hover:bg-white/5 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-reply-text-secondary dark:text-reply-text-secondary-dark font-mono text-xs font-semibold">
                          <Clock className="w-3.5 h-3.5" />
                          {format(new Date(log.createdAt), "HH:mm:ss", { locale: es })}
                          <span className="opacity-50 ml-1">
                            {format(new Date(log.createdAt), "dd MMM", { locale: es })}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-reply-text-secondary/60" />
                          <span className="text-sm font-bold text-reply-text-primary dark:text-reply-text-primary-dark">{log.companyName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-reply-text-primary dark:text-reply-text-primary-dark">{log.userName}</span>
                          <span className="text-[9px] text-reply-text-secondary/80 dark:text-reply-text-secondary-dark/80 font-mono">ID: {log.userId?.substring(0, 8)}...</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={getBadgeVariant(log.action)}>
                          {log.action}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5 text-reply-text-secondary/60" />
                          <span className="text-xs text-reply-text-primary dark:text-reply-text-primary-dark font-mono font-medium">
                            {log.entity} <span className="opacity-40">#{log.entityId.substring(0, 6)}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setSelectedLog(log)}
                          className="text-reply-brand hover:text-reply-brand-dark p-0 h-auto hover:bg-transparent font-bold text-xs flex items-center gap-1"
                        >
                          <Info className="w-3.5 h-3.5" />
                          Ver Payload
                        </Button>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex flex-col items-end">
                          <span className="text-xs font-mono font-bold text-reply-text-primary dark:text-reply-text-primary-dark">{log.ipAddress || "Internal"}</span>
                          <span className="text-[9px] text-reply-text-secondary/60 dark:text-reply-text-secondary-dark/60 truncate max-w-[120px]">{log.userAgent?.substring(0, 30)}...</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Payload Viewer Modal */}
      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Detalles de Auditoría / Payload JSON"
        icon={<Terminal className="w-5 h-5 text-indigo-500" />}
        size="lg"
      >
        {selectedLog && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-reply-border dark:border-reply-border-dark">
              <div>
                <span className="font-bold block text-reply-text-secondary dark:text-reply-text-secondary-dark uppercase tracking-wider text-[10px]">Entidad</span>
                <span className="font-semibold text-reply-text-primary dark:text-reply-text-primary-dark text-sm">{selectedLog.entity}</span>
              </div>
              <div>
                <span className="font-bold block text-reply-text-secondary dark:text-reply-text-secondary-dark uppercase tracking-wider text-[10px]">ID de Entidad</span>
                <span className="font-mono text-reply-text-primary dark:text-reply-text-primary-dark text-sm">{selectedLog.entityId}</span>
              </div>
              <div>
                <span className="font-bold block text-reply-text-secondary dark:text-reply-text-secondary-dark uppercase tracking-wider text-[10px]">Acción</span>
                <span className="font-bold text-reply-text-primary dark:text-reply-text-primary-dark text-sm">{selectedLog.action}</span>
              </div>
              <div>
                <span className="font-bold block text-reply-text-secondary dark:text-reply-text-secondary-dark uppercase tracking-wider text-[10px]">Usuario Operador</span>
                <span className="font-semibold text-reply-text-primary dark:text-reply-text-primary-dark text-sm">{selectedLog.userName}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black text-reply-text-secondary dark:text-reply-text-secondary-dark uppercase tracking-widest">
                Payload / Detalles Técnicos
              </label>
              <div className="bg-slate-900 text-slate-100 p-4 rounded-2xl font-mono text-xs overflow-x-auto max-h-[350px] border border-slate-800">
                <pre>{JSON.stringify(selectedLog.details, null, 2)}</pre>
              </div>
            </div>
            
            <div className="flex justify-end pt-2">
              <Button onClick={() => setSelectedLog(null)}>
                Cerrar Detalle
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
