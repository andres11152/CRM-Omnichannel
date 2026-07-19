import React, { useEffect, useState } from "react";
import { adminService } from "@/services/adminService";
import { ModuleHeader } from "./common/ModuleHeader";
import { Skeleton } from "boneyard-js/react";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { StaggerContainer, fadeUpVariant, AnimatedCard } from "./ui/Motion";
import { motion } from "framer-motion";
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
  TrendingUp,
  Receipt
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

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
  transactions: Transaction[];
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
      const res = (await adminService.getBillingTransactions()) as unknown as BillingResponse;
      setTransactions(res.transactions || []);
      setStats(res.stats);
    } catch (error) {
      console.error(error);
      toast.error("Error al cargar transacciones");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleRetry = async (txn: Transaction) => {
    if (!confirm(`¿Reintentar cobro de $${txn.amount / 100} a ${txn.tenant.name}?`)) return;
    try {
      setRetryingId(txn.id);
      await adminService.retryTransaction(txn.id);
      toast.success("Cobro reprogramado");
      setTransactions((prev) => prev.map((t) => (t.id === txn.id ? { ...t, status: "pending" } : t)));
    } catch (error) {
      toast.error("Error al reintentar");
    } finally {
      setRetryingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "succeeded":
        return <Badge variant="success">Pagado</Badge>;
      case "failed":
        return <Badge variant="error" className="animate-pulse">Fallido</Badge>;
      case "refunded":
        return <Badge variant="neutral">Reembolso</Badge>;
      default:
        return <Badge variant="warning">Pendiente</Badge>;
    }
  };

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark animate-in fade-in duration-500 overflow-hidden">
      <ModuleHeader
        title="Facturación Global"
        description="Centro de control financiero y conciliación de suscripciones SaaS"
        icon={<Receipt className="w-8 h-8 text-white" />}
        gradient="from-slate-800 via-slate-900 to-emerald-900 dark:from-black dark:via-slate-900 dark:to-emerald-950"
        stats={{
          label: "Ingresos Hoy",
          value: stats ? `$${(stats.revenue_today / 100).toLocaleString()}` : "$0.00"
        }}
        action={
          <Button
            onClick={loadData}
            variant="secondary"
            className="bg-white/10 hover:bg-white/20 border-white/20 text-white dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/20 dark:text-white backdrop-blur-md shadow-none"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Sincronizar
          </Button>
        }
      />

      <div className="flex-1 p-6 md:p-8 overflow-y-auto custom-scrollbar space-y-6">
        {/* Statistics Row - ANIMATED */}
        <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
           <motion.div variants={fadeUpVariant}>
             <BillingStatCard 
                title="Pagos Exitosos" 
                value={stats?.succeeded_count || 0} 
                icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />} 
                label="24h Window"
             />
           </motion.div>
           <motion.div variants={fadeUpVariant}>
             <BillingStatCard 
                title="Fallos de Cobro" 
                value={stats?.failed_count || 0} 
                icon={<AlertTriangle className="w-5 h-5 text-rose-500" />} 
                label="Acción Requerida"
                trend={stats?.failed_count ? "Attention" : "Optimal"}
             />
           </motion.div>
           <motion.div variants={fadeUpVariant}>
             <BillingStatCard 
                title="Reembolsos" 
                value={stats?.refunds_count || 0} 
                icon={<RotateCcw className="w-5 h-5 text-slate-500" />} 
                label="Periodo Actual"
             />
           </motion.div>
           <motion.div variants={fadeUpVariant}>
              <AnimatedCard className="bg-reply-brand dark:bg-reply-brand-dark/30 p-5 rounded-2xl border border-reply-brand/20 shadow-lg shadow-reply-brand/10 text-white relative overflow-hidden h-full cursor-pointer">
                 <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none">
                    <TrendingUp className="w-24 h-24" />
                 </div>
                 <div className="relative z-10">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/80 mb-1 opacity-70">Revenue Today</p>
                    <p className="text-3xl font-black font-mono">${stats ? (stats.revenue_today / 100).toLocaleString() : "0.00"}</p>
                    <div className="mt-4 flex items-center gap-2 text-[10px] font-bold bg-white/10 w-fit px-3 py-1 rounded-full border border-white/10 backdrop-blur-sm transition-all hover:bg-white/20">
                       <ArrowUpRight className="w-3 h-3" />
                       LIVE FLOW
                    </div>
                 </div>
              </AnimatedCard>
           </motion.div>
        </StaggerContainer>

        {/* Transactions Table Container */}
        <Card className="flex flex-col min-h-[400px]">
          <div className="p-6 border-b border-reply-border dark:border-reply-border-dark bg-reply-panel/30 dark:bg-white/5 flex items-center justify-between">
            <h3 className="font-bold text-reply-text-primary dark:text-white flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-reply-brand" />
              Historial de Transacciones
            </h3>
          </div>

          <div className="overflow-x-auto flex-1">
            <Skeleton name="billing-ops-table" loading={loading}>
              <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-reply-border-dark bg-slate-50/30 dark:bg-black/20">
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Cliente (Tenant)</th>
                  <th className="px-6 py-4">Concepto / Referencia</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4 text-right">Monto</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-reply-border-dark text-sm">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center">
                       <div className="flex flex-col items-center gap-3 text-slate-400">
                         <Receipt className="w-12 h-12 opacity-10" />
                         <p className="font-medium">No hay registros financieros recientes</p>
                       </div>
                    </td>
                  </tr>
                ) : (
                  transactions.map((txn) => (
                    <tr key={txn.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group">
                      <td className="px-6 py-4">{getStatusBadge(txn.status)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-reply-bg dark:bg-reply-surface-dark flex items-center justify-center text-xs font-black text-reply-brand">
                            {txn.tenant.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-700 dark:text-slate-200">{txn.tenant.name}</p>
                            <p className="text-[10px] text-slate-500 font-medium">{txn.tenant.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-700 dark:text-slate-300">{txn.description}</p>
                        <p className="text-[10px] font-mono text-slate-400">REF: {txn.invoiceId}</p>
                      </td>
                      <td className="px-6 py-4 text-slate-500 whitespace-nowrap">
                         <div className="flex flex-col">
                            <span className="font-bold text-slate-600 dark:text-slate-400">{format(new Date(txn.date), "dd MMM, yyyy", { locale: es })}</span>
                            <span className="text-[10px] opacity-60">{format(new Date(txn.date), "HH:mm:ss")}</span>
                         </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-black font-mono text-slate-800 dark:text-white text-base">
                          ${(txn.amount / 100).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                           {txn.status === "failed" && (
                             <Button
                               onClick={() => handleRetry(txn)}
                               isLoading={retryingId === txn.id}
                               variant="primary"
                               size="sm"
                               className="h-8 w-8 p-0 rounded-lg"
                             >
                               {!retryingId && <RefreshCw className="w-3.5 h-3.5" />}
                             </Button>
                           )}
                           <Button
                             variant="secondary"
                             size="sm"
                             className="h-8 w-8 p-0 rounded-lg"
                           >
                             <Download className="w-3.5 h-3.5" />
                           </Button>
                           <Button
                             variant="secondary"
                             size="sm"
                             className="h-8 w-8 p-0 rounded-lg"
                           >
                             <ExternalLink className="w-3.5 h-3.5" />
                           </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </Skeleton>
          </div>
        </Card>
      </div>
    </div>
  );
};

const BillingStatCard = ({ title, value, icon, label, trend }: { title: string; value: number | string; icon: React.ReactNode; label: string; trend?: "Optimal" | "Attention" }) => (
  <AnimatedCard className="bg-white dark:bg-reply-panel-dark p-5 rounded-2xl border border-reply-border dark:border-reply-border-dark shadow-sm group hover:border-reply-brand/30 transition-colors h-full cursor-pointer">
    <div className="flex items-center justify-between mb-4">
      <div className="p-2.5 rounded-xl bg-reply-bg dark:bg-white/5 text-reply-text-secondary dark:text-reply-text-secondary-dark border border-reply-border dark:border-white/5">
        {icon}
      </div>
      {trend && (
         <Badge variant={trend === "Optimal" ? "success" : "error"}>
            {trend}
         </Badge>
      )}
    </div>
    <div>
      <p className="text-2xl font-black text-reply-text-primary dark:text-white font-mono leading-none">{value}</p>
      <div className="mt-2 flex items-center justify-between">
         <p className="text-xs text-reply-text-secondary dark:text-reply-text-secondary-dark font-bold">{title}</p>
         <p className="text-[10px] text-reply-text-secondary/60 dark:text-reply-text-secondary-dark/60 font-bold uppercase tracking-widest">{label}</p>
      </div>
    </div>
  </AnimatedCard>
);
