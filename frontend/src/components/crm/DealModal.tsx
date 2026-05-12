import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { Deal, Account } from "@/types/crm";
import { getAccounts, updateDeal, createDeal } from "@/services/crmService";
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
  lostReason?: string;
  notes?: string;
}

const LOST_REASONS = [
  "Precio alto",
  "Competencia",
  "Sin presupuesto",
  "Sin respuesta",
  "No cumple requisitos",
  "Timing inadecuado",
  "Otro",
];

export const DealModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSave,
  deal,
}) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<DealFormData>({
    title: "",
    value: 0,
    currency: "COP",
    lostReason: "",
    pipelineId: "",
    stageId: "",
    probability: 10,
    accountId: "",
    expectedCloseDate: "",
  });
  const [activeTab, setActiveTab] = useState<"details" | "history">("details");
  const [pipelines, setPipelines] = useState<
    Array<{
      id: string;
      name: string;
      isDefault?: boolean;
      stages: Array<{ id: string; name: string; color?: string }>;
    }>
  >([]);
  const [currentStages, setCurrentStages] = useState<
    Array<{ id: string; name: string; color?: string }>
  >([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<
    Array<{ id: string; name: string; email?: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [activities, setActivities] = useState<
    Array<{
      id: string;
      type: string;
      subject: string;
      description?: string;
      createdAt: string;
      assignedTo?: { name: string };
    }>
  >([]);
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
        lostReason: "",
        pipelineId: "",
        stageId: "",
        probability: 10,
        accountId: "",
        contactId: "",
        expectedCloseDate: "",
        stage: undefined,
        notes: "",
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
              (s: { id: string; name: string }) => s.id === formData.stageId,
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
        dataToSave.contactId = undefined; // Use undefined, not || null
      } else {
        dataToSave.accountId = undefined; // Use undefined, not || null
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
        // Cast to Partial<Deal> to safely exclude conflicting 'stage' property
        // The service handles logic based on stageId anyway
        const { stage, ...cleanData } = dataToSave;
        await updateDeal(deal.id, cleanData as Partial<Deal>);
      } else {
        const { stage, ...cleanData } = dataToSave;
        await createDeal(cleanData as Partial<Deal>);
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
      <div className="bg-white dark:bg-reply-panel-dark rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 dark:border-reply-border-dark flex flex-col max-h-[90vh]">
        {/* Header with Tabs */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-reply-border-dark flex justify-between items-center bg-white dark:bg-reply-panel-dark">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {deal ? t("crm.activities.deal") : t("crm.activities.new_deal")}
              </h2>
            </div>
            {deal && (
              <div className="flex bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1">
                <button
                  onClick={() => setActiveTab("details")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === "details" ? "bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400 hover:text-gray-700"}`}
                >
                  {t("crm.accounts.form.general_info")}
                </button>
                <button
                  onClick={() => setActiveTab("history")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === "history" ? "bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400 hover:text-gray-700"}`}
                >
                  {t("crm.activities.history")}
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors bg-reply-bg dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded-full"
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
                  {t("common.name")} *
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
                    {t("tenants.metrics.status")}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.value}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        value: e.target.value ? parseFloat(e.target.value) : 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-reply-text dark:text-reply-text-dark focus:ring-2 focus:ring-reply-blue focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("common.soon")}
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) =>
                      setFormData({ ...formData, currency: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-reply-text dark:text-reply-text-dark focus:ring-2 focus:ring-reply-blue focus:border-transparent"
                  >
                    <option value="COP"> COP</option>
                    <option value="USD"> USD</option>
                    <option value="EUR"> EUR</option>
                    <option value="MXN"> MXN</option>
                    <option value="BRL"> BRL</option>
                    <option value="PEN"> PEN</option>
                    <option value="CLP"> CLP</option>
                    <option value="ARS"> ARS</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t("crm.accounts.fields.related_to")}
                  </label>
                  <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setAssociationType("account")}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${associationType === "account" ? "bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-300" : "text-gray-500 dark:text-gray-400"}`}
                    >
                      <Building2 className="w-3 h-3" />
                      {t("navigation.accounts")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssociationType("contact")}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${associationType === "contact" ? "bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-300" : "text-gray-500 dark:text-gray-400"}`}
                    >
                      <User className="w-3 h-3" />
                      {t("navigation.contacts")}
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
                    <option value="">{t("crm.accounts.form.select_placeholder")}</option>
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
                    <option value="">{t("crm.accounts.form.select_placeholder")}</option>
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
                    {t("crm.accounts.fields.status")}
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
                        probability: e.target.value ? parseInt(e.target.value) : 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-reply-text dark:text-reply-text-dark focus:ring-2 focus:ring-reply-blue focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("crm.activities.expected_close")}
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

              {/* Lost Reason (shows only when stage is "Perdido") */}
              {currentStages.find(
                (s: { id: string; name: string }) =>
                  s.id === formData.stageId && /perdido|lost/i.test(s.name),
              ) && (
                <div className="bg-red-50 dark:bg-red-900/10 rounded-lg p-4 border border-red-200 dark:border-red-800/30">
                  <label className="block text-sm font-medium text-red-700 dark:text-red-400 mb-2">
                    ¿Por qué se perdió este deal? *
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {LOST_REASONS.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() =>
                          setFormData({ ...formData, lostReason: reason })
                        }
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                          formData.lostReason === reason
                            ? "bg-red-600 text-white border-red-600 shadow-sm"
                            : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-red-300"
                        }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Initial Notes (only for new deals) */}
              {!deal && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                     {t("crm.accounts.form.description")}
                  </label>
                  <textarea
                    value={formData.notes || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    rows={3}
                    maxLength={2000}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-reply-text dark:text-reply-text-dark focus:ring-2 focus:ring-reply-blue focus:border-transparent resize-none text-sm"
                    placeholder="Ej. Cliente referido por Juan, interesado en plan Enterprise. Presupuesto aprobado para Q1."
                  />
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                    Se registrar como primera actividad del deal
                  </p>
                </div>
              )}

              <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-100 dark:border-reply-border-dark">
                {deal && (
                  <button
                    onClick={async () => {
                      if (
                        window.confirm(
                          "¿Ests seguro de eliminar este deal? Esta acción no se puede deshacer.",
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
                    {t("crm.activities.delete_activity")}
                  </button>
                )}
                <div className="flex gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm font-medium"
                  >
                    {loading && (
                      <Loader2 className="animate-spin h-4 w-4 text-white" />
                    )}
                    {deal ? t("common.save") : t("common.new")}
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
                    {t("crm.activities.send_email")}
                  </button>
                )}
              </div>

              {loadingActivities ? (
                <div className="text-center py-8 text-gray-500">
                  {t("common.loading")}...
                </div>
              ) : activities.length === 0 ? (
                <div className="text-center py-12 text-gray-400 flex flex-col items-center">
                  <Inbox className="w-12 h-12 mb-3 opacity-20" />
                  <p>No hay actividades registradas para este deal.</p>
                </div>
              ) : (
                <div className="relative border-l-2 border-gray-200 dark:border-reply-border-dark ml-3 space-y-8">
                  {activities.map((activity) => (
                    <div key={activity.id} className="relative pl-8">
                      {/* Timeline Dot */}
                      <div
                        className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white dark:border-reply-border-dark ${
                          activity.type === "EMAIL"
                            ? "bg-blue-500"
                            : activity.type === "TASK"
                              ? "bg-green-500"
                              : activity.type === "CALL"
                                ? "bg-purple-500"
                                : "bg-gray-400"
                        }`}
                      ></div>

                      <div className="bg-reply-bg dark:bg-gray-800/50 rounded-lg p-4 border border-gray-100 dark:border-reply-border-dark">
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
