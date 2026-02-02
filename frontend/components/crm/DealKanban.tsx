import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { Deal } from "../../types/crm";
import { getDeals } from "../../services/crmService";
import { DealModal } from "./DealModal";
import { ModuleHeader } from "../common/ModuleHeader";
import { api } from "../../src/lib/axios";

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

export const DealKanban: React.FC = () => {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | undefined>(undefined);

  const createDefaultPipeline = async () => {
    try {
      console.log("[Pipeline] Creating default pipeline...");
      await api.post("/pipelines", {
        name: "Pipeline de Ventas",
        isDefault: true,
      });
      toast.success("Pipeline inicializado correctamente");
      return true;
    } catch (e: any) {
      // If pipeline already exists (unique constraint), just proceed silently
      const msg = e.response?.data?.message || e.message;
      if (msg?.includes("ya está en uso") || msg?.includes("already exists")) {
        console.log(
          "[Pipeline] Default pipeline already exists, skipping creation",
        );
        return true; // Return true to proceed with fetching
      }
      console.error("Failed to create default pipeline", e);
      toast.error("Error inicializando pipeline");
      return false;
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch pipeline with stages
      const resPipelines = await api.get("/pipelines");
      const pipelines = resPipelines.data.data.pipelines || [];

      let defaultPipeline =
        pipelines.find((p: Pipeline) => p.isDefault) || pipelines[0];

      // Auto-initialize if empty
      if (!defaultPipeline) {
        const success = await createDefaultPipeline();
        if (success) {
          // Retry fetch
          const retryRes = await api.get("/pipelines");
          defaultPipeline = retryRes.data.data.pipelines?.[0];
        }
      }

      if (defaultPipeline) {
        // Fetch full pipeline with stages
        const resFull = await api.get(`/pipelines/${defaultPipeline.id}`);
        setPipeline(resFull.data.data.pipeline);

        // Fetch deals for this pipeline
        // getDeals is already refactored to use axios
        const dealsData = await getDeals({ pipelineId: defaultPipeline.id });
        setDeals(dealsData.deals || []);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      // toast.error('Error al cargar los datos'); // Silent fail first
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const newStageId = destination.droppableId;
    const deal = deals.find((d) => d.id === draggableId);

    if (!deal) return;

    // Calculate new order based on position
    const newOrder = destination.index;

    // Optimistic Update
    const originalDeals = [...deals];
    setDeals((prev) =>
      prev.map((d) =>
        d.id === draggableId
          ? { ...d, stageId: newStageId, order: newOrder }
          : d,
      ),
    );

    try {
      await api.patch(`/deals/${draggableId}/order`, {
        stageId: newStageId, // Correct field name
        order: newOrder,
      });
      toast.success("Deal movido exitosamente");
    } catch (error) {
      console.error("Error updating deal stage:", error);
      setDeals(originalDeals); // Revert
      toast.error("Error al actualizar la etapa del deal.");
    }
  };

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

  const formatCurrency = (value: number, currency: string = "COP") => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-reply-blue"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark overflow-hidden">
      {/* Header */}
      <ModuleHeader
        title="Pipeline de Ventas"
        description="Gestiona tus oportunidades de negocio"
        icon={
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        }
        gradient="from-blue-600 to-indigo-600 dark:from-blue-800 dark:to-indigo-800"
        stats={{
          label: "Total Deals",
          value: deals.length,
        }}
        action={
          <button
            onClick={handleCreate}
            className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors backdrop-blur-sm border border-white/20 font-medium"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Nuevo Deal
          </button>
        }
      />

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-6">
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

                // Map color hex to tailwind classes
                const getColorClasses = (hexColor: string) => {
                  const colorMap: Record<string, string> = {
                    "#3B82F6":
                      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
                    "#8B5CF6":
                      "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
                    "#F59E0B":
                      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
                    "#EC4899":
                      "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
                    "#10B981":
                      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
                    "#EF4444":
                      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
                  };
                  return (
                    colorMap[hexColor] ||
                    "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300"
                  );
                };

                return (
                  <div
                    key={stage.id}
                    className="w-80 flex flex-col h-full bg-gray-100 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700"
                  >
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-reply-panel-dark rounded-t-xl sticky top-0 z-10">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm uppercase">
                          {stage.name}
                        </h3>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${getColorClasses(stage.color)}`}
                        >
                          {columnDeals.length}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                        {formatCurrency(totalValue, "USD")}
                      </div>
                    </div>

                    <Droppable droppableId={stage.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`flex-1 p-2 overflow-y-auto transition-colors scrollbar-thin ${
                            snapshot.isDraggingOver
                              ? "bg-blue-50 dark:bg-blue-900/10"
                              : ""
                          }`}
                        >
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
                                  className={`bg-white dark:bg-reply-panel-dark rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-3 p-3 cursor-pointer hover:shadow-md transition-all group ${
                                    snapshot.isDragging
                                      ? "rotate-2 scale-105 shadow-xl z-50 ring-2 ring-reply-blue"
                                      : ""
                                  }`}
                                  style={provided.draggableProps.style}
                                >
                                  <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-semibold text-reply-text dark:text-reply-text-dark text-sm line-clamp-2">
                                      {deal.title}
                                    </h4>
                                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                      {formatCurrency(
                                        deal.value,
                                        deal.currency,
                                      )}
                                    </span>
                                  </div>

                                  {deal.account && (
                                    <div className="flex items-center gap-1.5 mb-2 text-xs text-gray-500 dark:text-gray-400">
                                      <svg
                                        className="w-3.5 h-3.5"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                                        />
                                      </svg>
                                      <span className="truncate">
                                        {deal.account.name}
                                      </span>
                                    </div>
                                  )}

                                  <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                                    <div className="flex items-center gap-2">
                                      {deal.probability > 0 && (
                                        <span
                                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                            deal.probability >= 80
                                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                              : deal.probability >= 50
                                                ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                                : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                                          }`}
                                        >
                                          {deal.probability}%
                                        </span>
                                      )}
                                    </div>
                                    {deal.expectedCloseDate && (
                                      <span className="text-[10px] text-gray-400">
                                        {new Date(
                                          deal.expectedCloseDate,
                                        ).toLocaleDateString()}
                                      </span>
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
