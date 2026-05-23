import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { Deal } from "@/types/crm";
import { getDeals } from "@/services/crmService";
import { DealModal } from "./DealModal";
import { ModuleHeader } from "../common/ModuleHeader";
import { api } from "@/lib/axios";
import {
  Plus,
  TrendingUp,
  Target,
  Trophy,
  XCircle,
  Building2,
  User,
  Calendar,
  Filter,
  BarChart3,
  ArrowUpRight,
  Clock,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────
interface Stage {
  id: string;
  name: string;
  color: string;
  order: number;
}

interface Pipeline {
  id: string;
  name: string;
  stages: Stage[];
  isDefault: boolean;
}

// ─── Helpers ──────────────────────────────────────────────

/** Format currency with locale-aware separators */
const formatCurrency = (value: number, currency: string = "COP"): string => {
  const locale =
    currency === "COP" ? "es-CO" : currency === "MXN" ? "es-MX" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

/** Determine dominant currency from a list of deals */
const getDominantCurrency = (deals: Deal[]): string => {
  if (deals.length === 0) return "COP";
  const freq: Record<string, number> = {};
  for (const d of deals) {
    freq[d.currency] = (freq[d.currency] || 0) + 1;
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
};

/** Map hex color to tailwind color classes */
const getColorClasses = (hexColor: string): string => {
  const colorMap: Record<string, string> = {
    "#3B82F6":
      "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 ring-blue-500/20",
    "#6366F1":
      "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 ring-indigo-500/20",
    "#8B5CF6":
      "bg-violet-500/10 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400 ring-violet-500/20",
    "#F59E0B":
      "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 ring-amber-500/20",
    "#EC4899":
      "bg-pink-500/10 text-pink-600 dark:bg-pink-500/20 dark:text-pink-400 ring-pink-500/20",
    "#10B981":
      "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 ring-emerald-500/20",
    "#EF4444":
      "bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 ring-red-500/20",
  };
  return (
    colorMap[hexColor] ||
    "bg-gray-500/10 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400 ring-gray-500/20"
  );
};

/** Get the hex color for the column accent bar */
const getAccentColor = (hexColor: string): string => {
  const map: Record<string, string> = {
    "#3B82F6": "bg-blue-500",
    "#6366F1": "bg-indigo-500",
    "#8B5CF6": "bg-violet-500",
    "#F59E0B": "bg-amber-500",
    "#EC4899": "bg-pink-500",
    "#10B981": "bg-emerald-500",
    "#EF4444": "bg-red-500",
  };
  return map[hexColor] || "bg-gray-500";
};

/** Check if a stage is a "Won" stage by name convention */
const isWonStage = (name: string): boolean =>
  /ganado|won|cerrado\s?ganado/i.test(name);

/** Check if a stage is a "Lost" stage by name convention */
const isLostStage = (name: string): boolean =>
  /perdido|lost|cerrado\s?perdido/i.test(name);

// ─── Component ────────────────────────────────────────────
export const DealKanban: React.FC = () => {
  const { t } = useTranslation();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | undefined>(undefined);

  // ── Pipeline auto-init ────────────────────────────
  const createDefaultPipeline = async (): Promise<boolean> => {
    try {
      await api.post("/pipelines", {
        name: t("crm.pipelines.title"),
        isDefault: true,
      });
      toast.success(t("crm.pipelines.pipeline_created"));
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg?.includes("ya está en uso") || msg?.includes("already exists")) {
        return true;
      }
      console.error("[Pipeline] Failed to create default", e);
      toast.error(t("common.error"));
      return false;
    }
  };

  // ── Data Fetch ────────────────────────────────────
  const fetchData = async () => {
    try {
      setLoading(true);
      const resPipelines = await api.get("/pipelines");
      const pipelines = resPipelines.data.data.pipelines || [];
      let defaultPipeline =
        pipelines.find((p: Pipeline) => p.isDefault) || pipelines[0];

      if (!defaultPipeline) {
        const success = await createDefaultPipeline();
        if (success) {
          const retryRes = await api.get("/pipelines");
          defaultPipeline = retryRes.data.data.pipelines?.[0];
        }
      }

      if (defaultPipeline) {
        const resFull = await api.get(`/pipelines/${defaultPipeline.id}`);
        setPipeline(resFull.data.data.pipeline);
        const dealsData = await getDeals({ pipelineId: defaultPipeline.id });
        setDeals(dealsData.deals || []);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ── KPIs ──────────────────────────────────────────
  const kpis = useMemo(() => {
    const dominantCurrency = getDominantCurrency(deals);
    const totalValue = deals.reduce((sum, d) => sum + d.value, 0);
    const activeDeals = deals.filter(
      (d) =>
        !isWonStage(d.stage?.name || "") && !isLostStage(d.stage?.name || ""),
    );
    const wonDeals = deals.filter((d) => isWonStage(d.stage?.name || ""));
    const lostDeals = deals.filter((d) => isLostStage(d.stage?.name || ""));
    const wonValue = wonDeals.reduce((sum, d) => sum + d.value, 0);
    const avgDealSize = deals.length > 0 ? totalValue / deals.length : 0;
    const conversionRate =
      wonDeals.length + lostDeals.length > 0
        ? Math.round(
            (wonDeals.length / (wonDeals.length + lostDeals.length)) * 100,
          )
        : 0;

    return {
      totalValue,
      activeDeals: activeDeals.length,
      wonDeals: wonDeals.length,
      wonValue,
      lostDeals: lostDeals.length,
      avgDealSize,
      conversionRate,
      dominantCurrency,
    };
  }, [deals]);

  // ── Drag & Drop ───────────────────────────────────
  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    )
      return;

    const newStageId = destination.droppableId;
    const deal = deals.find((d) => d.id === draggableId);
    if (!deal) return;

    const newOrder = destination.index;
    const originalDeals = [...deals];

    // Optimistic update
    setDeals((prev) =>
      prev.map((d) =>
        d.id === draggableId
          ? { ...d, stageId: newStageId, order: newOrder }
          : d,
      ),
    );

    try {
      await api.patch(`/deals/${draggableId}/order`, {
        stageId: newStageId,
        order: newOrder,
      });

      // Find new stage name
      const newStage = pipeline?.stages.find((s) => s.id === newStageId);
      if (newStage) {
        if (isWonStage(newStage.name)) {
          toast.success(t("crm.deals.won_toast"));
        } else if (isLostStage(newStage.name)) {
          toast(t("crm.deals.lost_toast"), { icon: "😔" });
        } else {
          toast.success(`${t("crm.deals.moved_success")} "${newStage.name}"`);
        }
      }
    } catch (error) {
      console.error("Error updating deal stage:", error);
      setDeals(originalDeals);
      toast.error(t("common.error"));
    }
  };

  // ── Handlers ──────────────────────────────────────
  const handleEdit = (deal: Deal) => {
    setSelectedDeal(deal);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedDeal(undefined);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedDeal(undefined);
    fetchData();
  };

  // ── Loading State ─────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-reply-bg dark:bg-reply-bg-dark">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-gray-200 dark:border-gray-700"></div>
            <div className="absolute top-0 left-0 w-16 h-16 rounded-full border-4 border-transparent border-t-blue-500 animate-spin"></div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium animate-pulse">
            {t("common.loading")}
          </p>
        </div>
      </div>
    );
  }

  // ── Main Render ───────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark overflow-hidden">
      {/* Header */}
      <ModuleHeader
        title={t("crm.pipelines.title")}
        description={t("crm.pipelines.description")}
        icon={<TrendingUp className="w-8 h-8 text-white" strokeWidth={1.5} />}
        gradient="from-blue-600 to-indigo-600 dark:from-blue-800 dark:to-indigo-800"
        stats={{
          label: t("crm.activities.deal"),
          value: deals.length,
        }}
        action={
          <Button
            onClick={handleCreate}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10 hover:border-white/30 backdrop-blur-sm h-10 px-4 gap-2 font-bold bg-white/10"
          >
            <Plus className="w-4 h-4" />
            {t("crm.activities.new_deal")}
          </Button>
        }
      />

      {/* KPI Summary Bar */}
      <div className="px-6 py-3 border-b border-gray-200 dark:border-reply-border-dark bg-white dark:bg-reply-panel-dark">
        <div className="flex items-center gap-6 overflow-x-auto scrollbar-none">
          {/* Total Pipeline Value */}
          <div className="flex items-center gap-2.5 min-w-fit">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center">
              <BarChart3 className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">
                {t("sales.pipeline_value")}
              </p>
              <p className="text-sm font-bold text-gray-800 dark:text-white">
                {formatCurrency(kpis.totalValue, kpis.dominantCurrency)}
              </p>
            </div>
          </div>

          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 flex-shrink-0" />

          {/* Active Deals */}
          <div className="flex items-center gap-2.5 min-w-fit">
            <div className="w-9 h-9 rounded-lg bg-violet-500/10 dark:bg-violet-500/20 flex items-center justify-center">
              <Target className="w-4.5 h-4.5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">
                {t("dashboard.status.active")}
              </p>
              <p className="text-sm font-bold text-gray-800 dark:text-white">
                {kpis.activeDeals}
              </p>
            </div>
          </div>

          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 flex-shrink-0" />

          {/* Won */}
          <div className="flex items-center gap-2.5 min-w-fit">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center">
              <Trophy className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">
                {t("crm.status.won")}
              </p>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {kpis.wonDeals}{" "}
                <span className="text-[10px] font-normal text-gray-400">
                  ({formatCurrency(kpis.wonValue, kpis.dominantCurrency)})
                </span>
              </p>
            </div>
          </div>

          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 flex-shrink-0" />

          {/* Lost */}
          <div className="flex items-center gap-2.5 min-w-fit">
            <div className="w-9 h-9 rounded-lg bg-red-500/10 dark:bg-red-500/20 flex items-center justify-center">
              <XCircle className="w-4.5 h-4.5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">
                {t("crm.status.lost")}
              </p>
              <p className="text-sm font-bold text-red-500 dark:text-red-400">
                {kpis.lostDeals}
              </p>
            </div>
          </div>

          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 flex-shrink-0" />

          {/* Conversion Rate */}
          <div className="flex items-center gap-2.5 min-w-fit">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 dark:bg-amber-500/20 flex items-center justify-center">
              <ArrowUpRight className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">
                {t("crm.deals.conversion")}
              </p>
              <p className="text-sm font-bold text-gray-800 dark:text-white">
                {kpis.conversionRate}%
              </p>
            </div>
          </div>

          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 flex-shrink-0" />

          {/* Avg Deal Size */}
          <div className="flex items-center gap-2.5 min-w-fit">
            <div className="w-9 h-9 rounded-lg bg-pink-500/10 dark:bg-pink-500/20 flex items-center justify-center">
              <TrendingUp className="w-4.5 h-4.5 text-pink-600 dark:text-pink-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">
                {t("crm.deals.avg_deal_size")}
              </p>
              <p className="text-sm font-bold text-gray-800 dark:text-white">
                {formatCurrency(kpis.avgDealSize, kpis.dominantCurrency)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-4 pb-6">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 h-full min-w-max">
            {pipeline?.stages
              ?.sort((a, b) => a.order - b.order)
              .map((stage) => {
                const columnDeals = deals.filter((d) => d.stageId === stage.id);
                const totalValue = columnDeals.reduce(
                  (sum, d) => sum + d.value,
                  0,
                );
                const columnCurrency = getDominantCurrency(columnDeals);
                const isWon = isWonStage(stage.name);
                const isLost = isLostStage(stage.name);

                return (
                  <div
                    key={stage.id}
                    className={`w-80 flex flex-col h-full rounded-xl border transition-colors ${
                      isWon
                        ? "bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/30"
                        : isLost
                          ? "bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30"
                          : "bg-gray-50 dark:bg-gray-900/40 border-gray-200 dark:border-reply-border-dark"
                    }`}
                  >
                    {/* Column Header */}
                    <div className="relative overflow-hidden rounded-t-xl">
                      {/* Accent bar */}
                      <div
                        className={`absolute top-0 left-0 right-0 h-1 ${getAccentColor(stage.color)}`}
                      />
                      <div className="p-3 pt-4 bg-white/80 dark:bg-reply-panel-dark/80 backdrop-blur-sm">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            {isWon && (
                              <Trophy className="w-4 h-4 text-emerald-500" />
                            )}
                            {isLost && (
                              <XCircle className="w-4 h-4 text-red-500" />
                            )}
                            <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm uppercase tracking-wide">
                              {stage.name}
                            </h3>
                          </div>
                          <span
                            className={`text-xs px-2.5 py-1 rounded-full font-bold ring-1 ${getColorClasses(stage.color)}`}
                          >
                            {columnDeals.length}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold tabular-nums">
                          {formatCurrency(totalValue, columnCurrency)}
                        </div>
                      </div>
                    </div>

                    {/* Droppable Area */}
                    <Droppable droppableId={stage.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`flex-1 p-2 overflow-y-auto transition-all duration-200 scrollbar-thin ${
                            snapshot.isDraggingOver
                              ? "bg-blue-50/60 dark:bg-blue-900/10 ring-2 ring-inset ring-blue-300/50 dark:ring-blue-600/30 rounded-b-xl"
                              : ""
                          }`}
                        >
                          {columnDeals.length === 0 &&
                            !snapshot.isDraggingOver && (
                              <div className="flex flex-col items-center justify-center py-12 text-gray-300 dark:text-gray-600">
                                <Target className="w-8 h-8 mb-2 opacity-40" />
                                <p className="text-xs font-medium">
                                  {t("common.loading")}...
                                </p>
                              </div>
                            )}

                          {columnDeals.map((deal, index) => (
                            <Draggable
                              key={deal.id}
                              draggableId={deal.id}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  onClick={() => handleEdit(deal)}
                                  className={`bg-white dark:bg-reply-panel-dark rounded-xl shadow-sm border mb-2.5 p-3.5 cursor-pointer transition-all group hover:shadow-lg hover:-translate-y-0.5 ${
                                    snapshot.isDragging
                                      ? "rotate-[2deg] scale-105 shadow-2xl z-50 ring-2 ring-blue-500/50 border-blue-300"
                                      : isWon
                                        ? "border-emerald-200 dark:border-emerald-800/30 hover:border-emerald-300"
                                        : isLost
                                          ? "border-red-200 dark:border-red-800/30 hover:border-red-300 opacity-75 hover:opacity-100"
                                          : "border-gray-100 dark:border-reply-border-dark hover:border-blue-200 dark:hover:border-blue-800/40"
                                  }`}
                                  style={provided.draggableProps.style}
                                >
                                  {/* Deal Title & Value */}
                                  <div className="flex justify-between items-start mb-2.5">
                                    <h4 className="font-semibold text-gray-800 dark:text-gray-100 text-sm line-clamp-2 leading-snug pr-2">
                                      {deal.title}
                                    </h4>
                                    <span
                                      className={`text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0 ${
                                        isWon
                                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                          : isLost
                                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                            : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                                      }`}
                                    >
                                      {formatCurrency(
                                        deal.value,
                                        deal.currency,
                                      )}
                                    </span>
                                  </div>

                                  {/* Account / Contact */}
                                  {(deal.account || deal.contact) && (
                                    <div className="flex items-center gap-1.5 mb-2 text-xs text-gray-500 dark:text-gray-400">
                                      {deal.account ? (
                                        <>
                                          <Building2 className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                                          <span className="truncate">
                                            {deal.account.name}
                                          </span>
                                        </>
                                      ) : deal.contact ? (
                                        <>
                                          <User className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                                          <span className="truncate">
                                            {deal.contact.name}
                                          </span>
                                        </>
                                      ) : null}
                                    </div>
                                  )}

                                  {/* Probability Bar (only for active deals) */}
                                  {!isWon &&
                                    !isLost &&
                                    deal.probability > 0 && (
                                      <div className="mb-2.5">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                                            {t("crm.deals.probability")}
                                          </span>
                                          <span
                                            className={`text-[10px] font-bold ${
                                              deal.probability >= 80
                                                ? "text-emerald-600 dark:text-emerald-400"
                                                : deal.probability >= 50
                                                  ? "text-amber-600 dark:text-amber-400"
                                                  : "text-gray-500 dark:text-gray-400"
                                            }`}
                                          >
                                            {deal.probability}%
                                          </span>
                                        </div>
                                        <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                          <div
                                            className={`h-full rounded-full transition-all duration-500 ${
                                              deal.probability >= 80
                                                ? "bg-emerald-500"
                                                : deal.probability >= 50
                                                  ? "bg-amber-500"
                                                  : "bg-gray-400"
                                            }`}
                                            style={{
                                              width: `${deal.probability}%`,
                                            }}
                                          />
                                        </div>
                                      </div>
                                    )}

                                  {/* Footer: Agent & Date */}
                                  <div className="flex justify-between items-center pt-2.5 border-t border-gray-50 dark:border-gray-800/50">
                                    {/* Assigned Agent */}
                                    <div className="flex items-center gap-1.5">
                                      {deal.assignedTo ? (
                                        <div className="flex items-center gap-1.5">
                                          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                                            <span className="text-[8px] font-bold text-white leading-none">
                                              {deal.assignedTo.name
                                                ?.slice(0, 2)
                                                .toUpperCase()}
                                            </span>
                                          </div>
                                          <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[80px]">
                                            {deal.assignedTo.name}
                                          </span>
                                        </div>
                                      ) : (
                                        <span className="text-[10px] text-gray-300 dark:text-gray-600 italic">
                                          {t("crm.deals.unassigned")}
                                        </span>
                                      )}
                                    </div>

                                    {/* Expected Close Date */}
                                    {deal.expectedCloseDate && (
                                      <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
                                        <Clock className="w-3 h-3" />
                                        <span>
                                          {new Date(
                                            deal.expectedCloseDate,
                                          ).toLocaleDateString("es-CO", {
                                            day: "2-digit",
                                            month: "short",
                                          })}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
          </div>
        </DragDropContext>
      </div>

      {/* Deal Modal */}
      {isModalOpen && (
        <DealModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleModalClose}
          deal={selectedDeal}
        />
      )}
    </div>
  );
};
