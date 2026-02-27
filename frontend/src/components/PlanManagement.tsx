import React, { useState, useEffect } from "react";
import { toast } from "sonner"; // New Import
import { Plan, PlanConfig } from "@/types";
import { adminService } from "@/services/adminService";
import { ModuleHeader } from "./common/ModuleHeader";

// Metadata for known features to provide icons and descriptions
const FEATURE_META: Record<
  string,
  {
    label: string;
    description: string;
    icon: React.ReactNode;
    type: "number" | "boolean";
  }
> = {
  max_users: {
    label: "Usuarios/Agentes Mximos",
    description: "Cantidad total de miembros del equipo permitidos.",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
    ),
    type: "number",
  },
  max_queues: {
    label: "Colas de Atención",
    description: "Número de departamentos o flujos de enrutamiento.",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
        />
      </svg>
    ),
    type: "number",
  },
  max_whatsapp_sessions: {
    label: "Sesiones de WhatsApp",
    description: "Límite de números de teléfono conectados.",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
        />
      </svg>
    ),
    type: "number",
  },
  enable_ai: {
    label: "Motor de IA (Bots)",
    description: "Acceso a asistentes inteligentes y respuestas automticas.",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
    type: "boolean",
  },
  enable_api: {
    label: "Acceso a API",
    description: "Permite integraciones externas y Webhooks.",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
        />
      </svg>
    ),
    type: "boolean",
  },
  max_ai_assistants: {
    label: "Asistentes IA Mximos",
    description: "Cantidad de personalidades de IA configurables.",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
    type: "number",
  },
  max_workflows: {
    label: "Workflows Activos",
    description: "Automatizaciones de marketing simultneas.",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    ),
    type: "number",
  },
  storage_limit_gb: {
    label: "Almacenamiento (GB)",
    description: "Espacio en disco para archivos multimedia.",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
        />
      </svg>
    ),
    type: "number",
  },
  max_contacts: {
    label: "Contactos Mximos",
    description: "Número mximo de personas permitidas en el CRM.",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>
    ),
    type: "number",
  },
  max_companies: {
    label: "Empresas Mximas",
    description: "Número mximo de organizaciones permitidas (Multi-tenant).",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
        />
      </svg>
    ),
    type: "number",
  },
  max_whatsapp_connections: {
    label: "Conexiones WhatsApp (Legacy)",
    description: "Límite de números de teléfono conectados.",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
        />
      </svg>
    ),
    type: "number",
  },
  can_remove_branding: {
    label: "Marca Blanca",
    description: "Opción para ocultar el logo de la plataforma.",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
        />
      </svg>
    ),
    type: "boolean",
  },
  can_use_ai: {
    label: "Habilitar Motor IA (Legacy)",
    description: "Acceso a bots inteligentes.",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
    type: "boolean",
  },
  can_use_api: {
    label: "API & Webhooks (Legacy)",
    description: "Acceso para desarrolladores.",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
        />
      </svg>
    ),
    type: "boolean",
  },
};

interface Props {
  onNavigateToDashboard: () => void;
}

export const PlanManagement: React.FC<Props> = ({ onNavigateToDashboard }) => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Plan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    setIsLoading(true);
    try {
      const fetchedPlans = await adminService.getAllPlans();
      // Sort plans by price
      const sortedPlans = fetchedPlans.sort((a, b) => a.price - b.price);
      setPlans(sortedPlans);

      if (sortedPlans.length > 0 && !selectedPlanId) {
        setSelectedPlanId(sortedPlans[0].id);
      } else if (
        selectedPlanId &&
        !sortedPlans.find((p) => p.id === selectedPlanId)
      ) {
        // If selected plan was deleted, select the first one
        setSelectedPlanId(sortedPlans[0]?.id || null);
      }
    } catch (error) {
      console.error("Failed to fetch plans", error);
      toast.error("Error al cargar los planes. Por favor recarga la pgina.");
    } finally {
      setIsLoading(false);
    }
  };

  // Sync form data when selection changes
  useEffect(() => {
    if (selectedPlanId) {
      const plan = plans.find((p) => p.id === selectedPlanId);
      if (plan) {
        setFormData(JSON.parse(JSON.stringify(plan))); // Deep copy to avoid direct mutation
      }
    } else {
      setFormData(null);
    }
  }, [selectedPlanId, plans]);

  const handleInputChange = (field: keyof Plan, value: string) => {
    if (!formData) return;
    setFormData({ ...formData, [field]: value });
  };

  const handlePriceChange = (value: string) => {
    if (!formData) return;
    const price = parseFloat(value);
    setFormData({ ...formData, price: isNaN(price) ? 0 : price });
  };

  const handleConfigChange = (
    key: string,
    value: string | number | boolean,
  ) => {
    if (!formData) return;
    setFormData({
      ...formData,
      config: { ...formData.config, [key]: value },
    });
  };

  const addFeature = (key: string) => {
    if (!formData || formData.config[key] !== undefined) return;
    const meta = FEATURE_META[key];
    const defaultValue = meta?.type === "number" ? 0 : false;

    setFormData({
      ...formData,
      config: { ...formData.config, [key]: defaultValue },
    });
  };

  const removeFeature = (key: string) => {
    if (!formData) return;
    const newConfig = { ...formData.config };
    delete (newConfig as any)[key];
    setFormData({ ...formData, config: newConfig });
  };

  const handleSave = async () => {
    if (!formData) return;
    setIsSaving(true);
    try {
      const savedPlan = await adminService.savePlan(formData);

      // Update local list
      setPlans((prev) => {
        const exists = prev.find((p) => p.id === savedPlan.id);
        if (exists) {
          return prev.map((p) => (p.id === savedPlan.id ? savedPlan : p));
        } else {
          return [...prev, savedPlan];
        }
      });

      toast.success("¡Plan guardado correctamente!");
    } catch (error) {
      console.error("Error saving plan", error);
      toast.error("Error al guardar el plan. Inténtalo de nuevo.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreatePlan = () => {
    // Generate a temporary ID. In a real app, backend might generate this,
    // but since we use upsert with ID, we need to provide one.
    const newId = crypto.randomUUID
      ? crypto.randomUUID()
      : `plan_${Date.now()}`;

    const newPlan: Plan = {
      id: newId,
      name: "Nuevo Plan",
      price: 0,
      currency: "USD",
      stripePriceId: "",
      isActive: true,
      config: {
        max_users: 1,
        max_queues: 1,
        max_whatsapp_connections: 1,
        can_use_ai: false,
        can_remove_branding: false,
        can_use_api: false,
      },
    };

    setPlans((prev) => [...prev, newPlan]);
    setSelectedPlanId(newPlan.id);
  };

  const handleDeletePlan = async () => {
    if (!selectedPlanId || !formData) return;

    if (
      window.confirm(
        `¿Ests seguro de que deseas eliminar el plan "${formData.name}"? Esta acción no se puede deshacer.`,
      )
    ) {
      setIsDeleting(true);
      try {
        await adminService.deletePlan(selectedPlanId);

        const newPlans = plans.filter((p) => p.id !== selectedPlanId);
        setPlans(newPlans);
        setSelectedPlanId(newPlans[0]?.id || null);

        toast.success("Plan eliminado correctamente.");
      } catch (error) {
        console.error("Error deleting plan", error);
        toast.error("Error al eliminar el plan.");
      } finally {
        setIsDeleting(false);
      }
    }
  };

  // Determine which features are not yet added to the current plan
  const currentFeatures = formData ? Object.keys(formData.config) : [];
  const availableFeaturesToAdd = Object.keys(FEATURE_META).filter(
    (f) => !currentFeatures.includes(f),
  );

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark">
      <ModuleHeader
        title="Gestión de Planes"
        description="Define límites y características de cada plan de suscripción."
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
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
        }
        gradient="from-emerald-600 to-teal-600 dark:from-emerald-800 dark:to-teal-800"
        action={
          <button
            onClick={onNavigateToDashboard}
            className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm font-bold backdrop-blur-sm border border-white/20 transition-all flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Volver al Panel
          </button>
        }
      />

      <div className="flex-1 p-6 overflow-hidden">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
          </div>
        ) : (
          <div className="h-full flex gap-6">
            {/* SIDEBAR: LIST OF PLANS */}
            <div className="w-80 flex flex-col bg-white dark:bg-reply-panel-dark rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-lg overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-reply-surface-dark">
                <h3 className="font-bold text-gray-700 dark:text-gray-200">
                  Planes Disponibles
                </h3>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {plans.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPlanId(p.id)}
                    className={`p-4 rounded-xl cursor-pointer transition-all border relative group ${
                      selectedPlanId === p.id
                        ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500 dark:border-indigo-400 ring-1 ring-indigo-500 dark:ring-indigo-400"
                        : "bg-white dark:bg-reply-border-dark border-gray-200 dark:border-reply-border-dark hover:border-indigo-300 dark:hover:border-indigo-500"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span
                        className={`font-bold text-lg ${selectedPlanId === p.id ? "text-indigo-700 dark:text-indigo-300" : "text-gray-800 dark:text-white"}`}
                      >
                        {p.name}
                      </span>
                      {selectedPlanId === p.id && (
                        <span className="text-indigo-600 dark:text-indigo-400">
                          ●
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                      ${p.price}{" "}
                      <span className="text-xs opacity-70">/mes</span>
                    </div>
                  </div>
                ))}

                {plans.length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm italic">
                    No hay planes creados.
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-reply-surface-dark">
                <button
                  onClick={handleCreatePlan}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg text-sm shadow-md transition-all transform active:scale-95 flex items-center justify-center gap-2"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                  Crear Nuevo Plan
                </button>
              </div>
            </div>

            {/* MAIN CONTENT: PLAN EDITOR */}
            <div className="flex-1 flex flex-col bg-white dark:bg-reply-panel-dark rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-lg overflow-hidden">
              {formData ? (
                <>
                  <div className="flex-1 overflow-y-auto p-8">
                    {/* HEADER INFO */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
                      <div className="md:col-span-5">
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">
                          Nombre del Plan
                        </label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) =>
                            handleInputChange("name", e.target.value)
                          }
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 bg-reply-bg dark:bg-reply-surface-dark text-gray-900 dark:text-white font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                          placeholder="Ej: Pro Plan"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">
                          Precio (USD)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-3 text-gray-500 dark:text-gray-400">
                            $
                          </span>
                          <input
                            type="number"
                            value={formData.price}
                            onChange={(e) => handlePriceChange(e.target.value)}
                            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg pl-8 pr-4 py-3 bg-reply-bg dark:bg-reply-surface-dark text-gray-900 dark:text-white font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                          />
                        </div>
                      </div>
                      <div className="md:col-span-4">
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">
                          Stripe Price ID
                        </label>
                        <input
                          type="text"
                          value={formData.stripePriceId || ""}
                          onChange={(e) =>
                            handleInputChange("stripePriceId", e.target.value)
                          }
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 bg-reply-bg dark:bg-reply-surface-dark text-gray-900 dark:text-white font-mono text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                          placeholder="price_..."
                        />
                      </div>
                    </div>

                    {/* FEATURES SECTION */}
                    <div className="mb-6">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-gray-800 dark:text-white text-lg flex items-center gap-2">
                          Límites y Features
                          <span className="text-xs font-normal text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                            {currentFeatures.length}
                          </span>
                        </h3>

                        {availableFeaturesToAdd.length > 0 && (
                          <div className="relative group z-10">
                            <button className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-2 border border-indigo-200 dark:border-indigo-800">
                              <span>+ Añadir Característica</span>
                            </button>
                            <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-reply-surface-dark rounded-xl shadow-2xl border border-gray-200 dark:border-reply-border-dark p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all transform origin-top-right">
                              <div className="text-xs font-bold text-gray-400 uppercase px-2 py-1 mb-1">
                                Disponibles
                              </div>
                              {availableFeaturesToAdd.map((key) => (
                                <button
                                  key={key}
                                  onClick={() => addFeature(key)}
                                  className="w-full flex items-center gap-3 p-3 hover:bg-reply-bg dark:hover:bg-[#2a3942] rounded-lg text-left transition-colors"
                                >
                                  <div className="text-gray-500 dark:text-gray-400">
                                    {FEATURE_META[key]?.icon}
                                  </div>
                                  <div>
                                    <p className="font-bold text-sm text-gray-800 dark:text-gray-200">
                                      {FEATURE_META[key]?.label}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-500 line-clamp-1">
                                      {FEATURE_META[key]?.description}
                                    </p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Standard Config Section */}
                      <div className="mb-8">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-100 dark:border-reply-border-dark pb-2">
                          Configuración General
                        </h3>
                        <div className="grid grid-cols-1 gap-4">
                          {currentFeatures
                            .filter(
                              (k) =>
                                ![
                                  "storage_limit_gb",
                                  "max_contacts",
                                  "max_companies",
                                  "max_workflows",
                                ].includes(k),
                            )
                            .map((key) => {
                              const value = (formData.config as any)[key];
                              const meta = FEATURE_META[key];
                              const label = meta?.label || key;
                              const description =
                                meta?.description ||
                                "Configuración personalizada";
                              const icon = meta?.icon || (
                                <span className="text-2xl">⚙️</span>
                              );
                              const type =
                                meta?.type ||
                                (typeof value === "boolean"
                                  ? "boolean"
                                  : "number");

                              return (
                                <div
                                  key={key}
                                  className="group relative flex items-center gap-5 bg-reply-bg dark:bg-reply-surface-dark p-5 rounded-xl border border-gray-200 dark:border-reply-border-dark hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                                >
                                  <div className="p-3 bg-white dark:bg-reply-panel-dark rounded-lg shadow-sm border border-gray-100 dark:border-reply-border-dark text-gray-600 dark:text-gray-300">
                                    {icon}
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-gray-800 dark:text-gray-200 text-base mb-0.5">
                                      {label}
                                    </h4>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                      {description}
                                    </p>
                                  </div>

                                  <div className="w-48">
                                    {type === "boolean" ? (
                                      <div className="relative">
                                        <select
                                          value={String(value)}
                                          onChange={(e) =>
                                            handleConfigChange(
                                              key,
                                              e.target.value === "true",
                                            )
                                          }
                                          className={`w-full appearance-none border rounded-lg px-4 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 transition-all cursor-pointer ${
                                            value
                                              ? "bg-green-50 text-green-700 border-green-200 focus:ring-green-500 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
                                              : "bg-red-50 text-red-700 border-red-200 focus:ring-red-500 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
                                          }`}
                                        >
                                          <option value="true">
                                            Habilitado
                                          </option>
                                          <option value="false">
                                            Deshabilitado
                                          </option>
                                        </select>
                                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-current">
                                          <svg
                                            className="h-4 w-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M19 9l-7 7-7-7"
                                            />
                                          </svg>
                                        </div>
                                      </div>
                                    ) : (
                                      <input
                                        type="number"
                                        value={String(value)}
                                        onChange={(e) =>
                                          handleConfigChange(
                                            key,
                                            Number(e.target.value),
                                          )
                                        }
                                        className="w-full bg-white dark:bg-reply-panel-dark border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-sm font-bold text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                      />
                                    )}
                                  </div>

                                  <button
                                    onClick={() => removeFeature(key)}
                                    className="absolute -top-2 -right-2 bg-white dark:bg-reply-border-dark text-gray-400 hover:text-red-500 p-1 rounded-full shadow-md border border-gray-200 dark:border-gray-600 opacity-0 group-hover:opacity-100 transition-all transform hover:scale-110"
                                    title="Eliminar característica"
                                  >
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M6 18L18 6M6 6l12 12"
                                      />
                                    </svg>
                                  </button>
                                </div>
                              );
                            })}
                        </div>
                      </div>

                      {/* Resource Limits (Quotas) Section */}
                      <div>
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-100 dark:border-reply-border-dark pb-2">
                          Límites de Recursos (Quotas)
                        </h3>
                        <div className="grid grid-cols-1 gap-4">
                          {[
                            "storage_limit_gb",
                            "max_contacts",
                            "max_companies",
                            "max_workflows",
                          ].map((key) => {
                            // If key is not in config, we can optionally skip or render default.
                            // User asked to "Add the inputs". So we render them if they exist in FEATURE_META, assuming we want to enable them.
                            // But typically we iterate currentFeatures. Let's merge logical existence.
                            // If it's missing from config, we treat it as unconfigured?
                            // To follow the visual instruction, I'll iterate existing quotas in config OR force them if I must.
                            // Let's simplify: iterate specific keys, if not in config, add to config with default -1?
                            // No, side effects in render are bad.
                            // Best approach: Filter currentFeatures for these keys.
                            // IF key is missing, user has to "Add Feature".
                            // BUT user said "Add inputs...". I'll assume they might be added via the "Add Feature" UI,
                            // OR I should just iterate them if they are in config.
                            if (!(formData.config as any).hasOwnProperty(key))
                              return null;

                            const value = (formData.config as any)[key];
                            const meta = FEATURE_META[key];
                            const isUnlimited = value === -1 || value === null;

                            return (
                              <div
                                key={key}
                                className="group relative flex items-center gap-5 bg-reply-bg dark:bg-reply-surface-dark p-5 rounded-xl border border-gray-200 dark:border-reply-border-dark hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                              >
                                <div className="p-3 bg-white dark:bg-reply-panel-dark rounded-lg shadow-sm border border-gray-100 dark:border-reply-border-dark text-gray-600 dark:text-gray-300">
                                  {meta?.icon}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <h4 className="font-bold text-gray-800 dark:text-gray-200 text-base mb-0.5 leading-tight">
                                    {meta?.label}
                                  </h4>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {meta?.description}
                                  </p>
                                  {key === "storage_limit_gb" && (
                                    <p className="text-[10px] text-indigo-500 font-medium mt-1">
                                      💡 1 GB ≈ 500 imgenes de alta calidad
                                    </p>
                                  )}
                                </div>

                                <div className="w-56 flex flex-col items-end gap-2">
                                  {/* Unlimited Toggle */}
                                  <div className="flex items-center gap-2 mb-1">
                                    <span
                                      className={`text-[10px] font-bold uppercase tracking-wider ${isUnlimited ? "text-green-600 dark:text-green-400" : "text-gray-400"}`}
                                    >
                                      {isUnlimited ? "Ilimitado" : "Limitado"}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleConfigChange(
                                          key,
                                          isUnlimited ? 0 : -1,
                                        )
                                      } // Toggle: If unlim (-1) -> 0 (limit mode). If limit -> -1
                                      className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none ${isUnlimited ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`}
                                    >
                                      <div
                                        className={`w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform duration-200 ease-in-out ${isUnlimited ? "translate-x-4" : "translate-x-0"}`}
                                      />
                                    </button>
                                  </div>

                                  <input
                                    type="number"
                                    disabled={isUnlimited}
                                    value={isUnlimited ? "" : String(value)}
                                    placeholder={isUnlimited ? "∞" : "0"}
                                    onChange={(e) =>
                                      handleConfigChange(
                                        key,
                                        Number(e.target.value),
                                      )
                                    }
                                    className={`w-full bg-white dark:bg-reply-panel-dark border rounded-lg px-4 py-2 text-sm font-bold transition-all
                                                    ${
                                                      isUnlimited
                                                        ? "border-gray-200 dark:border-reply-border-dark text-gray-400 italic cursor-not-allowed bg-reply-bg dark:bg-reply-surface-dark"
                                                        : "border-indigo-300 dark:border-indigo-600 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                                    }`}
                                  />
                                </div>

                                <button
                                  onClick={() => removeFeature(key)}
                                  className="absolute -top-2 -right-2 bg-white dark:bg-reply-border-dark text-gray-400 hover:text-red-500 p-1 rounded-full shadow-md border border-gray-200 dark:border-gray-600 opacity-0 group-hover:opacity-100 transition-all transform hover:scale-110 z-10"
                                  title="Eliminar característica"
                                >
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M6 18L18 6M6 6l12 12"
                                    />
                                  </svg>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* FOOTER ACTIONS */}
                  <div className="p-6 border-t border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-reply-surface-dark flex justify-between items-center">
                    <button
                      onClick={handleDeletePlan}
                      disabled={isDeleting}
                      className="bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/40 px-6 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {isDeleting ? "Eliminando..." : "Eliminar Plan"}
                    </button>

                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/30 transition-all transform active:scale-95 flex items-center gap-2 disabled:opacity-50"
                    >
                      {isSaving ? (
                        <>
                          <svg
                            className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          Guardando...
                        </>
                      ) : (
                        "Guardar Cambios"
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                  <div className="w-24 h-24 bg-gray-100 dark:bg-reply-surface-dark rounded-full flex items-center justify-center mb-4">
                    <svg
                      className="w-10 h-10 text-gray-300 dark:text-gray-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-600 dark:text-gray-300 mb-2">
                    Ningún plan seleccionado
                  </h3>
                  <p className="max-w-xs mx-auto">
                    Selecciona un plan de la lista o crea uno nuevo para
                    comenzar a editar.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
