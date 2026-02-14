import React, { useEffect, useState } from "react";
import { adminService } from "@/services/adminService";
import { ModuleHeader } from "./common/ModuleHeader";
import {
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  Download,
  ExternalLink,
  AlertTriangle,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

interface Transaction {
  id: string;
  tenant: { name: string; email: string; avatar: string };
  description: string;
  amount: number;
  currency: string;
  status: "succeeded" | "failed" | "refunded" | "pending";
  date: string;
  invoiceId: string;
}

interface BillingStats {
  succeeded_count: number;
  failed_count: number;
  refunds_count: number;
  revenue_today: number;
}

interface BillingResponse {
  data: Transaction[];
  stats: BillingStats;
}

export const BillingOpsPage = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const res =
        (await adminService.getBillingTransactions()) as unknown as BillingResponse;
      setTransactions(res.data);
      setStats(res.stats);
    } catch (error) {
      console.error(error);
      toast.error("Error cargando transacciones");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Optional: Poll every 60s for live sales
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleRetry = async (txn: Transaction) => {
    if (
      !confirm(
        `¿Reintentar cobro de $${txn.amount / 100} a ${txn.tenant.name}?`,
      )
    )
      return;

    try {
      setRetryingId(txn.id);
      await adminService.retryTransaction(txn.id);
      toast.success("Cobro reprogramado");

      // Optimistic update
      setTransactions((prev) =>
        prev.map((t) => (t.id === txn.id ? { ...t, status: "pending" } : t)),
      );
    } catch (error) {
      toast.error("Falló el reintento");
    } finally {
      setRetryingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "succeeded":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> Pagado
          </span>
        );
      case "failed":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 animate-pulse">
            <XCircle className="w-3.5 h-3.5" /> Fallido
          </span>
        );
      case "refunded":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400">
            <RotateCcw className="w-3.5 h-3.5" /> Reembolso
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <Clock className="w-3.5 h-3.5" /> Pendiente
          </span>
        );
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-reply-bg-dark">
      <ModuleHeader
        title="Facturación Global"
        description="Centro de operaciones de cobros y facturas"
        icon={<CreditCard className="w-8 h-8 text-white" />}
        gradient="from-emerald-600 to-teal-600 dark:from-emerald-900 dark:to-teal-900"
        stats={{
          label: "Ingresos Hoy",
          value: stats
            ? `$${(stats.revenue_today / 100).toLocaleString()}`
            : "...",
        }}
      />

      <div className="flex-1 overflow-hidden p-6 flex flex-col gap-6">
        {/* KPIs Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-none">
          <div className="bg-white dark:bg-reply-panel-dark p-4 rounded-xl shadow-sm border border-slate-200 dark:border-reply-border-dark flex items-center gap-4">
            <div className="p-3 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Pagos Exitosos
              </p>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {stats?.succeeded_count || 0}
              </h3>
            </div>
          </div>

          <div className="bg-white dark:bg-reply-panel-dark p-4 rounded-xl shadow-sm border border-slate-200 dark:border-reply-border-dark flex items-center gap-4">
            <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Fallidos (Atención)
              </p>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {stats?.failed_count || 0}
              </h3>
            </div>
          </div>

          <div className="bg-white dark:bg-reply-panel-dark p-4 rounded-xl shadow-sm border border-slate-200 dark:border-reply-border-dark flex items-center gap-4">
            <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Reembolsos
              </p>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {stats?.refunds_count || 0}
              </h3>
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-600 to-blue-600 text-white p-4 rounded-xl shadow-md flex items-center justify-between">
            <div>
              <p className="text-indigo-100 text-sm mb-1">
                Total Cobrado (Hoy)
              </p>
              <h3 className="text-2xl font-bold">
                ${stats ? (stats.revenue_today / 100).toLocaleString() : "0"}
              </h3>
            </div>
            <ArrowUpRight className="w-8 h-8 text-indigo-200" />
          </div>
        </div>

        {/* Transactions Table */}
        <div className="flex-1 bg-white dark:bg-reply-panel-dark rounded-xl shadow-sm border border-slate-200 dark:border-reply-border-dark flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-reply-border-dark flex justify-between items-center">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              Transacciones Recientes
              {loading && (
                <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
              )}
            </h3>
            <div className="flex gap-2">{/* Filters could go here */}</div>
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10 backdrop-blur-sm">
                <tr className="text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-reply-border-dark">
                  <th className="px-6 py-3">Estado</th>
                  <th className="px-6 py-3">Empresa</th>
                  <th className="px-6 py-3">Concepto / Plan</th>
                  <th className="px-6 py-3">Fecha</th>
                  <th className="px-6 py-3 text-right">Monto</th>
                  <th className="px-6 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-100 dark:divide-slate-800">
                {transactions.map((txn) => (
                  <tr
                    key={txn.id}
                    className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <td className="px-6 py-4">{getStatusBadge(txn.status)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">
                          {txn.tenant.avatar}
                        </div>
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white">
                            {txn.tenant.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {txn.tenant.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-700 dark:text-slate-300 font-medium">
                        {txn.description}
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">
                        {txn.invoiceId}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                      {new Date(txn.date).toLocaleDateString()}
                      <span className="ml-2 text-xs opacity-70">
                        {new Date(txn.date).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-slate-800 dark:text-slate-200">
                      ${(txn.amount / 100).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {txn.status === "failed" && (
                          <button
                            onClick={() => handleRetry(txn)}
                            disabled={retryingId === txn.id}
                            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-medium transition-colors shadow-sm disabled:opacity-50"
                          >
                            {retryingId === txn.id ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3 h-3" />
                            )}
                            Reintentar
                          </button>
                        )}
                        <button
                          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                          title="Descargar PDF"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                          title="Ver en Pasarela"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {transactions.length === 0 && !loading && (
              <div className="p-12 text-center text-slate-400">
                No se encontraron transacciones.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


