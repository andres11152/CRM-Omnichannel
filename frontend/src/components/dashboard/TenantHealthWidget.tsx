import React from "react";
import { Eye, AlertTriangle, CheckCircle2, Minus, Info } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { adminService } from "@/services/adminService";
import { toast } from "sonner";

export interface TenantHealth {
  id: string;
  name: string;
  logo?: string;
  plan: string;
  mrr: number;
  healthScore: number;
  healthStatus: "healthy" | "neutral" | "critical";
  factors: string[];
}

interface Props {
  tenants: TenantHealth[];
  loading?: boolean;
}

export const TenantHealthWidget: React.FC<Props> = ({ tenants, loading }) => {
  const login = useAuthStore((state) => state.login);

  const handleImpersonate = async (id: string, name: string) => {
    if (!confirm(`¿Acceder al panel de ${name}?`)) return;

    try {
      const result = await adminService.generateImpersonationToken(id);
      // Security: Save original Master Token to allow "Exit Impersonation"
      const currentToken = useAuthStore.getState().token;
      if (currentToken) {
        localStorage.setItem("reply_master_token", currentToken);
      }

      const userToLogin = {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        companyId: id,
        name: "Modo Impersonación",
        avatar: "",
        companyStatus: "ACTIVE",
      };

      login(
        userToLogin as unknown as Parameters<typeof login>[0],
        result.token,
      );
      window.location.href = "/dashboard";
    } catch (error) {
      toast.error("Error al iniciar impersonación");
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-emerald-500 text-emerald-500";
    if (score >= 50) return "bg-amber-500 text-amber-500";
    return "bg-red-500 text-red-500";
  };

  if (loading)
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-12 bg-gray-100 dark:bg-gray-800 rounded-lg"
          ></div>
        ))}
      </div>
    );

  return (
    <div className="overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-reply-border-dark">
            <th className="pb-2 font-medium">Cliente</th>
            <th className="pb-2 font-medium">Plan</th>
            <th className="pb-2 font-medium">Salud / Riesgo</th>
            <th className="pb-2 font-medium text-right">MRR</th>
            <th className="pb-2 font-medium text-right">Acción</th>
          </tr>
        </thead>
        <tbody className="text-sm">
          {tenants.map((t) => (
            <tr
              key={t.id}
              className="group hover:bg-reply-bg dark:hover:bg-white/5 transition-colors border-b border-gray-100 dark:border-reply-border-dark/50 last:border-0"
            >
              <td className="py-3 pr-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900 dark:to-purple-900 flex items-center justify-center text-xs font-bold text-indigo-700 dark:text-indigo-300">
                    {t.name.substring(0, 2).toUpperCase()}
                  </div>
                  <span className="font-medium text-gray-900 dark:text-white truncate max-w-[120px]">
                    {t.name}
                  </span>
                </div>
              </td>
              <td className="py-3">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    t.plan === "Enterprise"
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                      : t.plan === "Pro"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {t.plan}
                </span>
              </td>
              <td className="py-3">
                <div className="group/tooltip relative flex items-center gap-2 cursor-help">
                  {/* Progress Bar Visual */}
                  <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${getScoreColor(t.healthScore).split(" ")[0]}`}
                      style={{ width: `${t.healthScore}%` }}
                    />
                  </div>
                  <span
                    className={`text-xs font-bold ${getScoreColor(t.healthScore).split(" ")[1]}`}
                  >
                    {t.healthScore}
                  </span>

                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-gray-900 text-white text-xs rounded p-2 opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                    <div className="font-bold mb-1 border-b border-gray-700 pb-1">
                      Factores de Riesgo:
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-gray-300">
                      {t.factors.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </td>
              <td className="py-3 text-right font-medium text-gray-700 dark:text-gray-300">
                ${t.mrr.toLocaleString()}
              </td>
              <td className="py-3 text-right">
                <button
                  onClick={() => handleImpersonate(t.id, t.name)}
                  className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  title="Inspeccionar Cuenta"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
