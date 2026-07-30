import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  TrendingUp,
  Target,
  Gauge,
  XCircle,
  Trophy,
  Download,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { ModuleHeader } from "../common/ModuleHeader";
import {
  getSalesForecast,
  getStageConversion,
  getStageVelocity,
  getLostReasons,
  getRepLeaderboard,
  getDealRisk,
  exportLeaderboard,
  exportLostReasons,
  SalesForecast,
  StageConversion,
  StageVelocity,
  LostReason,
  RepLeaderboardEntry,
  DealRisk,
} from "@/services/salesAnalyticsService";

const monthInputValue = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const monthToRange = (monthValue: string): { start: Date; end: Date } => {
  const [year, month] = monthValue.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
};

export const SalesAnalyticsReport: React.FC = () => {
  const { t } = useTranslation();
  const [month, setMonth] = useState(() => monthInputValue(new Date()));
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  const [forecast, setForecast] = useState<SalesForecast | null>(null);
  const [conversion, setConversion] = useState<StageConversion[]>([]);
  const [velocity, setVelocity] = useState<StageVelocity[]>([]);
  const [lostReasons, setLostReasons] = useState<LostReason[]>([]);
  const [leaderboard, setLeaderboard] = useState<RepLeaderboardEntry[]>([]);
  const [dealRisks, setDealRisks] = useState<DealRisk[]>([]);

  useEffect(() => {
    const { start, end } = monthToRange(month);
    setLoading(true);
    Promise.all([
      getSalesForecast(start, end),
      getStageConversion(),
      getStageVelocity(),
      getLostReasons(start, end),
      getRepLeaderboard(start, end),
      getDealRisk(),
    ])
      .then(([f, c, v, l, r, risks]) => {
        setForecast(f);
        setConversion(c);
        setVelocity(v);
        setLostReasons(l);
        setLeaderboard(r);
        setDealRisks(risks);
      })
      .catch((err) => {
        console.error("SalesAnalyticsReport load error", err);
        toast.error(
          t("sales_report.toast.load_error", "Error al cargar el reporte de ventas"),
        );
      })
      .finally(() => setLoading(false));
  }, [month, t]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(val);

  const handleExport = async (
    kind: "leaderboard" | "lost-reasons",
    format: "csv" | "pdf",
  ) => {
    const key = `${kind}-${format}`;
    setExporting(key);
    try {
      const { start, end } = monthToRange(month);
      const result =
        kind === "leaderboard"
          ? await exportLeaderboard(format, start, end)
          : await exportLostReasons(format, start, end);
      window.open(result.downloadUrl, "_blank");
    } catch (err) {
      console.error("Export error", err);
      toast.error(t("sales_report.toast.export_error", "No se pudo generar el reporte"));
    } finally {
      setExporting(null);
    }
  };

  const conversionColors = ["#10b981", "#059669", "#047857", "#065f46", "#064e3b"];
  const velocityColors = ["#6366f1", "#4f46e5", "#4338ca", "#3730a3", "#312e81"];

  return (
    <div className="flex flex-col bg-slate-50 dark:bg-reply-bg-dark min-h-screen transition-colors duration-200 font-sans">
      <ModuleHeader
        title={t("sales_report.title", "Reportes de Ventas")}
        description={t(
          "sales_report.description",
          "Forecast, conversión por etapa, velocidad de venta y motivos de pérdida.",
        )}
        icon={
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
        }
        gradient="from-emerald-600 to-teal-600"
        action={
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5 text-sm font-semibold text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40 [color-scheme:dark]"
          />
        }
      />

      <div className="p-4 md:p-8 space-y-6 max-w-[1600px] mx-auto w-full">
        {loading ? (
          <div className="space-y-6 animate-pulse">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 bg-gray-200 dark:bg-gray-800/50 rounded-2xl" />
              ))}
            </div>
            <div className="h-80 bg-gray-200 dark:bg-gray-800/50 rounded-2xl" />
          </div>
        ) : (
          <>
            {/* KPI Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <KpiCard
                icon={<Target className="w-6 h-6" />}
                color="text-emerald-600 dark:text-emerald-400"
                bg="bg-emerald-50 dark:bg-emerald-900/20"
                label={t("sales_report.weighted_forecast", "Forecast Ponderado")}
                value={formatCurrency(forecast?.weightedForecast || 0)}
                subtitle={t("sales_report.weighted_forecast_desc", "Valor × probabilidad de cierre")}
              />
              <KpiCard
                icon={<Gauge className="w-6 h-6" />}
                color="text-blue-600 dark:text-blue-400"
                bg="bg-blue-50 dark:bg-blue-900/20"
                label={t("sales_report.open_pipeline", "Pipeline Abierto")}
                value={formatCurrency(forecast?.openPipelineValue || 0)}
                subtitle={t("sales_report.open_pipeline_desc", {
                  count: forecast?.dealCount || 0,
                  defaultValue: "{{count}} negocios activos",
                })}
              />
              <KpiCard
                icon={<Trophy className="w-6 h-6" />}
                color="text-amber-600 dark:text-amber-400"
                bg="bg-amber-50 dark:bg-amber-900/20"
                label={t("sales_report.top_rep", "Mejor Vendedor del Mes")}
                value={leaderboard[0]?.name || t("sales_report.no_data_short", "Sin datos")}
                subtitle={
                  leaderboard[0]
                    ? formatCurrency(leaderboard[0].wonValue)
                    : t("sales_report.no_closed_deals", "Sin negocios cerrados aún")
                }
              />
            </div>

            {/* Conversion + Velocity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartCard
                title={t("sales_report.conversion_title", "Conversión por Etapa")}
                subtitle={t(
                  "sales_report.conversion_subtitle",
                  "% de negocios que, tras pasar por cada etapa, terminaron ganados",
                )}
                empty={conversion.length === 0}
                emptyText={t(
                  "sales_report.conversion_empty",
                  "Aún no hay suficiente historial de cambios de etapa para calcular esto.",
                )}
              >
                <BarChart
                  data={conversion}
                  layout="vertical"
                  margin={{ top: 0, right: 30, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-100 dark:text-gray-800" />
                  <XAxis type="number" domain={[0, 100]} unit="%" />
                  <YAxis type="category" dataKey="stageName" width={110} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(value: number, _name, item) => [
                      `${value}% (${item.payload.dealsWon}/${item.payload.dealsEntered})`,
                      t("sales_report.conversion_tooltip", "Conversión"),
                    ]}
                  />
                  <Bar dataKey="conversionRate" radius={[0, 6, 6, 0]} barSize={22}>
                    {conversion.map((_entry, index) => (
                      <Cell key={index} fill={conversionColors[index % conversionColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartCard>

              <ChartCard
                title={t("sales_report.velocity_title", "Velocidad de Venta")}
                subtitle={t(
                  "sales_report.velocity_subtitle",
                  "Días promedio que un negocio permanece en cada etapa",
                )}
                empty={velocity.length === 0}
                emptyText={t(
                  "sales_report.velocity_empty",
                  "Aún no hay suficiente historial de cambios de etapa para calcular esto.",
                )}
              >
                <BarChart
                  data={velocity}
                  layout="vertical"
                  margin={{ top: 0, right: 30, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-100 dark:text-gray-800" />
                  <XAxis type="number" unit={t("sales_report.days_unit", "d")} />
                  <YAxis type="category" dataKey="stageName" width={110} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(value: number) => [
                      `${value} ${t("sales_report.days_unit_full", "días")}`,
                      t("sales_report.velocity_tooltip", "Tiempo promedio"),
                    ]}
                  />
                  <Bar dataKey="avgDays" radius={[0, 6, 6, 0]} barSize={22}>
                    {velocity.map((_entry, index) => (
                      <Cell key={index} fill={velocityColors[index % velocityColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartCard>
            </div>

            {/* Lost reasons + Leaderboard */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-reply-surface-dark rounded-2xl p-5 border border-gray-100 dark:border-gray-800/60 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                      <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                    </div>
                    {t("sales_report.lost_reasons_title", "Motivos de Pérdida")}
                  </h3>
                  <ExportButtons
                    onExport={(fmt) => handleExport("lost-reasons", fmt)}
                    exporting={exporting}
                    exportKeyPrefix="lost-reasons"
                  />
                </div>
                {lostReasons.length === 0 ? (
                  <EmptyState text={t("sales_report.lost_reasons_empty", "No se registraron negocios perdidos este período.")} />
                ) : (
                  <div className="space-y-2">
                    {lostReasons.map((r) => (
                      <div key={r.reason} className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-32 truncate">
                          {r.reason}
                        </span>
                        <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-red-500 dark:bg-red-600 flex items-center justify-end px-2"
                            style={{ width: `${Math.max(r.percentage, 6)}%` }}
                          >
                            <span className="text-[10px] font-bold text-white">
                              {r.percentage}%
                            </span>
                          </div>
                        </div>
                        <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-24 text-right">
                          {r.count} · {formatCurrency(r.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-reply-surface-dark rounded-2xl p-5 border border-gray-100 dark:border-gray-800/60 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                      <Trophy className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    {t("sales_report.leaderboard_title", "Ranking de Vendedores")}
                  </h3>
                  <ExportButtons
                    onExport={(fmt) => handleExport("leaderboard", fmt)}
                    exporting={exporting}
                    exportKeyPrefix="leaderboard"
                  />
                </div>
                {leaderboard.length === 0 ? (
                  <EmptyState text={t("sales_report.leaderboard_empty", "No hay negocios cerrados este período.")} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-gray-800/50">
                        <tr>
                          <th className="px-3 py-2">{t("sales_report.rep", "Vendedor")}</th>
                          <th className="px-3 py-2 text-center">{t("sales_report.won", "Ganados")}</th>
                          <th className="px-3 py-2 text-right">{t("sales_report.value", "Valor")}</th>
                          <th className="px-3 py-2 text-center">{t("sales_report.lost", "Perdidos")}</th>
                          <th className="px-3 py-2 text-right">{t("sales_report.conversion", "Conversión")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboard.map((rep, idx) => (
                          <tr key={rep.userId} className="border-b border-gray-100 dark:border-gray-800/60">
                            <td className="px-3 py-2 flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${idx === 0 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>
                                {idx + 1}
                              </span>
                              {rep.name}
                            </td>
                            <td className="px-3 py-2 text-center font-mono">{rep.wonCount}</td>
                            <td className="px-3 py-2 text-right font-mono">{formatCurrency(rep.wonValue)}</td>
                            <td className="px-3 py-2 text-center font-mono">{rep.lostCount}</td>
                            <td className="px-3 py-2 text-right font-mono">{rep.conversionRate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Deals at risk */}
            <div className="bg-white dark:bg-reply-surface-dark rounded-2xl p-5 border border-gray-100 dark:border-gray-800/60 shadow-sm">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                {t("sales_report.risk_title", "Deals en Riesgo")}
              </h3>
              <p className="text-xs text-gray-400 mb-4">
                {t(
                  "sales_report.risk_subtitle",
                  "Estancamiento, inactividad y tareas vencidas — explicado, no una caja negra",
                )}
              </p>
              {dealRisks.filter((r) => r.riskLevel !== "low").length === 0 ? (
                <EmptyState text={t("sales_report.risk_empty", "Ningún negocio abierto muestra señales de riesgo ahora mismo.")} />
              ) : (
                <div className="space-y-3">
                  {dealRisks
                    .filter((r) => r.riskLevel !== "low")
                    .slice(0, 10)
                    .map((risk) => (
                      <div
                        key={risk.dealId}
                        className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 flex items-start gap-3"
                      >
                        <span
                          className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            risk.riskLevel === "high"
                              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          }`}
                        >
                          {risk.riskLevel === "high" ? t("sales_report.risk_high", "Alto") : t("sales_report.risk_medium", "Medio")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                              {risk.title}
                            </span>
                            <span className="text-xs font-mono text-gray-500 dark:text-gray-400 shrink-0">
                              {formatCurrency(risk.value)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {risk.stageName}
                            {risk.assignedToName ? ` · ${risk.assignedToName}` : ""}
                          </p>
                          <ul className="mt-1.5 space-y-0.5">
                            {risk.reasons.map((reason, i) => (
                              <li key={i} className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1.5">
                                <span className="text-gray-300 dark:text-gray-600">•</span>
                                {reason}
                              </li>
                            ))}
                          </ul>
                          {risk.suggestedProbability !== null && (
                            <p className="text-xs mt-1.5 text-indigo-600 dark:text-indigo-400 font-medium">
                              {t("sales_report.suggested_probability", {
                                current: risk.currentProbability,
                                suggested: risk.suggestedProbability,
                                defaultValue: "Probabilidad actual: {{current}}% · Sugerida: {{suggested}}%",
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const KpiCard: React.FC<{
  icon: React.ReactNode;
  color: string;
  bg: string;
  label: string;
  value: string;
  subtitle: string;
}> = ({ icon, color, bg, label, value, subtitle }) => (
  <div className="bg-white dark:bg-reply-surface-dark rounded-2xl p-6 border border-gray-100 dark:border-gray-800/60 shadow-sm flex items-center gap-5">
    <div className={`w-14 h-14 rounded-2xl ${bg} flex items-center justify-center ${color}`}>
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1 truncate">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>
    </div>
  </div>
);

const ChartCard: React.FC<{
  title: string;
  subtitle: string;
  empty: boolean;
  emptyText: string;
  children: React.ReactElement;
}> = ({ title, subtitle, empty, emptyText, children }) => (
  <div className="h-96 bg-white dark:bg-reply-surface-dark rounded-2xl p-5 border border-gray-100 dark:border-gray-800/60 shadow-sm flex flex-col">
    <h3 className="text-base font-bold text-gray-900 dark:text-white">{title}</h3>
    <p className="text-xs text-gray-400 mb-4">{subtitle}</p>
    <div className="flex-1 min-h-0">
      {empty ? (
        <EmptyState text={emptyText} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      )}
    </div>
  </div>
);

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex flex-col items-center justify-center h-full text-center py-6">
    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-[260px]">{text}</p>
  </div>
);

const ExportButtons: React.FC<{
  onExport: (format: "csv" | "pdf") => void;
  exporting: string | null;
  exportKeyPrefix: string;
}> = ({ onExport, exporting, exportKeyPrefix }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5">
      {(["csv", "pdf"] as const).map((fmt) => {
        const key = `${exportKeyPrefix}-${fmt}`;
        const isBusy = exporting === key;
        return (
          <button
            key={fmt}
            onClick={() => onExport(fmt)}
            disabled={isBusy}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            title={t("sales_report.export_as", { format: fmt.toUpperCase(), defaultValue: `Exportar como ${fmt.toUpperCase()}` })}
          >
            {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            {fmt.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
};
