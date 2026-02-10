import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Deal, Account } from "../../types/crm";
import { getAccounts, updateDeal, createDeal } from "../../services/crmService";
import { EmailModal } from "../EmailModal";
import { toast } from "sonner";
import {
  X,
  Loader2,
  Mail,
  Trash2,
  Building2,
  User,
  Calendar,
  DollarSign,
  Target,
  Layers,
  Inbox,
} from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  deal?: Deal;
}

interface DealFormData {
  title: string;
  value: number;
  currency: string;
  pipelineId: string;
  stageId: string;
  probability: number;
  expectedCloseDate: string;
  accountId?: string;
  contactId?: string;
  stage?: string;
}

export const DealModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSave,
  deal,
}) => {
  const [formData, setFormData] = useState<DealFormData>({
    title: "",
    value: 0,
    currency: "COP",
    pipelineId: "",
    stageId: "",
    probability: 10,
    accountId: "",
    expectedCloseDate: "",
  });
  const [activeTab, setActiveTab] = useState<"details" | "history">("details");
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [currentStages, setCurrentStages] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [associationType, setAssociationType] = useState<"account" | "contact">(
    "account",
  );
  const [showEmailModal, setShowEmailModal] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [accountsData, contactsData, pipelinesData] = await Promise.all([
          getAccounts(),
          import("../../services/crmService").then((m) => m.getContacts()),
          import("../../services/crmService").then((m) => m.getPipelines()),
        ]);
        setAccounts(accountsData.accounts || []);
        setContacts(contactsData.contacts || []);
        setPipelines(pipelinesData.pipelines || []);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    fetchData();

    if (deal) {
      setFormData({
        title: deal.title,
        value: deal.value,
        currency: deal.currency,
        pipelineId: deal.pipelineId || "",
        stageId: deal.stageId || "",
        probability: deal.probability,
        accountId: deal.accountId || "",
        contactId: deal.contactId || "",
        expectedCloseDate: deal.expectedCloseDate
          ? new Date(deal.expectedCloseDate).toISOString().split("T")[0]
          : "",
      });
      if (deal.contactId) {
        setAssociationType("contact");
      } else {
        setAssociationType("account");
      }
    } else {
      setFormData({
        title: "",
        value: 0,
        currency: "COP",
        pipelineId: "",
        stageId: "",
        probability: 10,
        accountId: "",
        contactId: "",
        expectedCloseDate: "",
        stage: undefined,
      });
      setAssociationType("account");
    }
  }, [deal]);

  useEffect(() => {
    if (activeTab === "history" && deal) {
      const fetchDealActivities = async () => {
        setLoadingActivities(true);
        try {
          const { getActivities } = await import("../../services/crmService");
          const data = await getActivities({ dealId: deal.id });
          setActivities(data.activities || []);
        } catch (error) {
          console.error("Error fetching activities:", error);
        } finally {
          setLoadingActivities(false);
        }
      };
      fetchDealActivities();
    }
  }, [activeTab, deal]);

  // Update stages when pipeline changes
  useEffect(() => {
    if (pipelines.length > 0) {
      if (!formData.pipelineId) {
        // Defaults to first pipeline (usually default one)
        const defaultPipeline =
          pipelines.find((p) => p.isDefault) || pipelines[0];
        if (defaultPipeline) {
          setFormData((prev) => ({
            ...prev,
            pipelineId: defaultPipeline.id,
            stageId: defaultPipeline.stages[0]?.id || "",
          }));
        }
      } else {
        // Update current stages list
        const selectedPipeline = pipelines.find(
          (p) => p.id === formData.pipelineId,
        );
        if (selectedPipeline) {
          setCurrentStages(selectedPipeline.stages || []);
          // If current stageId is not in the new pipeline, reset it
          if (selectedPipeline.stages?.length > 0) {
            const stageExists = selectedPipeline.stages.find(
              (s: any) => s.id === formData.stageId,
            );
            if (!stageExists && !deal) {
              // Only reset if not editing existing deal (to avoid overwrite before load)
              setFormData((prev) => ({
                ...prev,
                stageId: selectedPipeline.stages[0].id,
              }));
            }
          }
        }
      }
    }
  }, [pipelines, formData.pipelineId, deal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const dataToSave = { ...formData };
      // Ensure we only send the relevant ID based on association type
      if (associationType === "account") {
        dataToSave.contactId = undefined; // Use undefined, not null
      } else {
        dataToSave.accountId = undefined; // Use undefined, not null
      }

      // Fix IDs if empty strings
      if (!dataToSave.contactId) dataToSave.contactId = undefined;
      if (!dataToSave.accountId) dataToSave.accountId = undefined;

      // Format Date
      if (dataToSave.expectedCloseDate) {
        dataToSave.expectedCloseDate = new Date(
          dataToSave.expectedCloseDate,
        ).toISOString();
      }

      if (deal) {
        // Cast to any to bypass strict Partial<Deal> check for conflicting 'stage' property
        // The service handles logic based on stageId anyway
        const { stage, ...cleanData } = dataToSave;
        await updateDeal(deal.id, cleanData as any);
      } else {
        const { stage, ...cleanData } = dataToSave;
        await createDeal(cleanData as any);
      }
      onSave();
    } catch (error) {
      console.error("Error saving deal:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#1f2937] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 dark:border-gray-700 flex flex-col max-h-[90vh]">
        {/* Header with Tabs */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-[#1f2937]">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {deal ? "Detalles del Deal" : "Nuevo Deal"}
              </h2>
            </div>
            {deal && (
              <div className="flex bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1">
                <button
                  onClick={() => setActiveTab("details")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === "details" ? "bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400 hover:text-gray-700"}`}
                >
                  Información
                </button>
                <button
                  onClick={() => setActiveTab("history")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === "history" ? "bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400 hover:text-gray-700"}`}
                >
                  Historial
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "details" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Título *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-reply-text dark:text-reply-text-dark focus:ring-2 focus:ring-reply-blue focus:border-transparent"
                  placeholder="Ej. Venta de Licencias Q1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Valor
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.value}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        value: parseFloat(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-reply-text dark:text-reply-text-dark focus:ring-2 focus:ring-reply-blue focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Moneda
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) =>
                      setFormData({ ...formData, currency: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-reply-text dark:text-reply-text-dark focus:ring-2 focus:ring-reply-blue focus:border-transparent"
                  >
                    <option value="COP">COP</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="MXN">MXN</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Asociado a
                  </label>
                  <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setAssociationType("account")}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${associationType === "account" ? "bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-300" : "text-gray-500 dark:text-gray-400"}`}
                    >
                      <Building2 className="w-3 h-3" />
                      Empresa
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssociationType("contact")}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${associationType === "contact" ? "bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-300" : "text-gray-500 dark:text-gray-400"}`}
                    >
                      <User className="w-3 h-3" />
                      Contacto
                    </button>
                  </div>
                </div>

                {associationType === "account" ? (
                  <select
                    value={formData.accountId}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        accountId: e.target.value,
                        contactId: "",
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-reply-text dark:text-reply-text-dark focus:ring-2 focus:ring-reply-blue focus:border-transparent"
                  >
                    <option value="">Seleccionar empresa...</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={formData.contactId}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        contactId: e.target.value,
                        accountId: "",
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-reply-text dark:text-reply-text-dark focus:ring-2 focus:ring-reply-blue focus:border-transparent"
                  >
                    <option value="">Seleccionar contacto...</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.name}{" "}
                        {contact.email ? `(${contact.email})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Pipeline and Stage Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Pipeline
                  </label>
                  <select
                    value={formData.pipelineId}
                    onChange={(e) =>
                      setFormData({ ...formData, pipelineId: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-reply-text dark:text-reply-text-dark focus:ring-2 focus:ring-reply-blue focus:border-transparent"
                  >
                    {pipelines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Etapa
                  </label>
                  <select
                    value={formData.stageId}
                    onChange={(e) =>
                      setFormData({ ...formData, stageId: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-reply-text dark:text-reply-text-dark focus:ring-2 focus:ring-reply-blue focus:border-transparent"
                  >
                    {currentStages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Probability and Date Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Probabilidad (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.probability}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        probability: parseInt(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-reply-text dark:text-reply-text-dark focus:ring-2 focus:ring-reply-blue focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Fecha Cierre Esperada
                  </label>
                  <input
                    type="date"
                    value={formData.expectedCloseDate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        expectedCloseDate: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-reply-text dark:text-reply-text-dark focus:ring-2 focus:ring-reply-blue focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
                {deal && (
                  <button
                    onClick={async () => {
                      if (
                        window.confirm(
                          "¿Estás seguro de eliminar este deal? Esta acción no se puede deshacer.",
                        )
                      ) {
                        setLoading(true);
                        try {
                          const { deleteDeal } =
                            await import("../../services/crmService");
                          await deleteDeal(deal.id);
                          onSave(); // Refresh list
                          onClose(); // Close modal
                        } catch (error) {
                          console.error("Error deleting deal:", error);
                          toast.error("Error al eliminar el deal");
                        } finally {
                          setLoading(false);
                        }
                      }
                    }}
                    className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    Eliminar Deal
                  </button>
                )}
                <div className="flex gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-reply-blue hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {loading && (
                      <Loader2 className="animate-spin h-4 w-4 text-white" />
                    )}
                    {deal ? "Guardar Cambios" : "Crear Deal"}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              {/* Actions Header for History */}
              <div className="flex justify-end mb-4">
                {deal?.contactId && (
                  <button
                    onClick={() => setShowEmailModal(true)}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
                  >
                    <Mail className="w-4 h-4" />
                    Enviar Email
                  </button>
                )}
              </div>

              {loadingActivities ? (
                <div className="text-center py-8 text-gray-500">
                  Cargando historial...
                </div>
              ) : activities.length === 0 ? (
                <div className="text-center py-12 text-gray-400 flex flex-col items-center">
                  <Inbox className="w-12 h-12 mb-3 opacity-20" />
                  <p>No hay actividades registradas para este deal.</p>
                </div>
              ) : (
                <div className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-3 space-y-8">
                  {activities.map((activity) => (
                    <div key={activity.id} className="relative pl-8">
                      {/* Timeline Dot */}
                      <div
                        className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 ${
                          activity.type === "EMAIL"
                            ? "bg-blue-500"
                            : activity.type === "TASK"
                              ? "bg-green-500"
                              : activity.type === "CALL"
                                ? "bg-purple-500"
                                : "bg-gray-400"
                        }`}
                      ></div>

                      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-100 dark:border-gray-700">
                        <div className="flex justify-between items-start mb-1">
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded ${
                              activity.type === "EMAIL"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                : activity.type === "TASK"
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                  : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                            }`}
                          >
                            {activity.type}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(activity.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm mb-1">
                          {activity.subject}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                          {activity.description}
                        </p>

                        {activity.assignedTo && (
                          <div className="mt-2 text-xs text-gray-400 flex items-center gap-1">
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                              />
                            </svg>
                            {activity.assignedTo.name}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showEmailModal && deal?.contactId && (
        <EmailModal
          isOpen={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          contactId={deal.contactId}
          contactEmail={
            contacts.find((c) => c.id === deal.contactId)?.email || ""
          }
        />
      )}
    </div>,
    document.body,
  );
};
