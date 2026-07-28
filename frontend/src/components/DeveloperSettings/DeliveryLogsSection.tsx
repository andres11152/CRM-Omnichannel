import React from "react";
import { useTranslation } from "react-i18next";
import { Activity, RefreshCw, CheckCircle, XCircle, RotateCcw } from "lucide-react";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { DeliveryLog } from "./types";

interface DeliveryLogsSectionProps {
  logs: DeliveryLog[];
  isRefreshingLogs: boolean;
  onRefresh: () => void;
  onReplayLog: (logId: string) => void;
}

export const DeliveryLogsSection: React.FC<DeliveryLogsSectionProps> = ({ logs, isRefreshingLogs, onRefresh, onReplayLog }) => {
  const { t } = useTranslation();
  return (
    <div className="mt-12 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-reply-text-primary dark:text-white text-lg flex items-center gap-2">
          <Activity className="w-5 h-5 text-reply-brand" />
          {t("developer_settings.delivery_logs.title", "Logs de Entrega Recientes")}
        </h3>
        <button
          onClick={onRefresh}
          disabled={isRefreshingLogs}
          className="flex items-center gap-1.5 text-reply-brand dark:text-reply-brand-light text-xs font-black hover:underline cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingLogs ? "animate-spin" : ""}`} />
          {t("developer_settings.delivery_logs.refresh", "ACTUALIZAR")}
        </button>
      </div>

      {/* Desktop table */}
      <Card className="hidden lg:block overflow-hidden shadow-sm border-reply-border dark:border-reply-border-dark">
        <table className="w-full text-left border-collapse">
          <thead className="bg-reply-bg dark:bg-gray-800/50 text-[10px] uppercase tracking-widest font-bold text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-reply-border-dark">
            <tr>
              <th className="px-6 py-4">{t("developer_settings.delivery_logs.table.status", "Status")}</th>
              <th className="px-6 py-4">{t("developer_settings.delivery_logs.table.event", "Evento")}</th>
              <th className="px-6 py-4">{t("developer_settings.delivery_logs.table.target_url", "URL Destino")}</th>
              <th className="px-6 py-4">{t("developer_settings.delivery_logs.table.datetime", "Fecha/Hora")}</th>
              <th className="px-6 py-4 text-right">{t("developer_settings.delivery_logs.table.latency", "Latencia")}</th>
              <th className="px-6 py-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic">
                  {t("developer_settings.delivery_logs.no_activity", "No hay actividad reciente.")}
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const isSuccess = log.status >= 200 && log.status < 300;
                return (
                  <tr key={log.id} className="hover:bg-reply-bg dark:hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4">
                      <Badge variant={isSuccess ? "success" : "error"}>
                        {isSuccess ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />} {log.status || "ERR"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 font-mono text-[11px] font-bold text-reply-text-secondary dark:text-reply-text-secondary-dark">
                      {log.eventType}
                    </td>
                    <td
                      className="px-6 py-4 text-reply-text-secondary dark:text-reply-text-secondary-dark truncate max-w-[200px] font-mono text-xs"
                      title={log.url}
                    >
                      {log.url}
                    </td>
                    <td className="px-6 py-4 text-reply-text-secondary/60 dark:text-reply-text-secondary-dark/60 text-xs">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-[11px] font-bold text-reply-brand">{log.duration}ms</td>
                    <td className="px-6 py-4 text-right">
                      {!isSuccess && (
                        <button
                          onClick={() => onReplayLog(log.id)}
                          className="text-reply-text-secondary/60 hover:text-reply-brand dark:hover:text-reply-brand-light transition-colors cursor-pointer"
                          title={t("developer_settings.delivery_logs.retry_delivery", "Reintentar entrega")}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-3">
        {logs.length === 0 ? (
          <div className="text-center py-10 text-reply-text-secondary dark:text-reply-text-secondary-dark italic text-sm">
            {t("developer_settings.delivery_logs.no_activity", "No hay actividad reciente.")}
          </div>
        ) : (
          logs.map((log) => {
            const isSuccess = log.status >= 200 && log.status < 300;
            return (
              <Card key={log.id} className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <Badge variant={isSuccess ? "success" : "error"}>
                    {isSuccess ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />} {log.status || "ERR"}
                  </Badge>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-reply-brand font-mono">{log.duration}ms</span>
                    {!isSuccess && (
                      <button
                        onClick={() => onReplayLog(log.id)}
                        className="text-reply-text-secondary/60 hover:text-reply-brand dark:hover:text-reply-brand-light transition-colors cursor-pointer"
                        title={t("developer_settings.delivery_logs.retry", "Reintentar")}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="font-mono text-[11px] font-bold text-reply-text-primary dark:text-reply-text-primary-dark">{log.eventType}</p>
                  <p className="text-[10px] text-reply-text-secondary/80 dark:text-reply-text-secondary-dark/80 break-all font-mono">{log.url}</p>
                </div>
                <div className="text-[10px] text-reply-text-secondary/60 dark:text-reply-text-secondary-dark/60 pt-2 border-t border-reply-border dark:border-reply-border-dark flex justify-between">
                  <span>{t("developer_settings.delivery_logs.attempt", "INTENTO #{{n}}", { n: log.attempt })}</span>
                  <span>{new Date(log.createdAt).toLocaleString()}</span>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};
