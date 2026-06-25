import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Settings2 } from "lucide-react";
import { Company, Plan, CompanyStatus } from "@/types";
import { Modal, ModalButton } from "@/components/ui/Modal";

interface Props {
  company: Company;
  plans: Plan[];
  onClose: () => void;
  onUpdate: (id: string, data: Partial<Company>) => Promise<void>;
}

export const EditTenantModal: React.FC<Props> = ({
  company,
  plans,
  onClose,
  onUpdate,
}) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: company.name,
    slug: company.slug || "",
    planId: company.planId || "",
    status: company.status,
    subscriptionEndsAt: company.subscriptionEndsAt
      ? new Date(company.subscriptionEndsAt).toISOString().split("T")[0]
      : "",
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onUpdate(company.id, {
        ...(formData as unknown as Partial<Company>),
        subscriptionEndsAt: formData.subscriptionEndsAt
          ? new Date(formData.subscriptionEndsAt)
          : undefined,
        planId: formData.planId || undefined,
      });
      onClose();
    } catch (error) {
      console.error("Failed to update", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={t("tenants.modal.edit_title", "Editar Empresa")}
      subtitle={
        <>
          {t("tenants.modal.edit_desc", "Modificando configuración para")}{" "}
          <span className="font-bold text-indigo-600 dark:text-indigo-400">{company.name}</span>
        </>
      }
      icon={<Settings2 className="w-5 h-5" />}
      size="lg"
      busy={isSaving}
      footer={
        <>
          <ModalButton variant="secondary" onClick={onClose}>
            {t("common.cancel", "Cancelar")}
          </ModalButton>
          <ModalButton variant="primary" type="submit" form="edit-tenant-form" loading={isSaving}>
            {isSaving ? t("tenants.modal.saving", "Guardando...") : t("tenants.modal.save_changes", "Guardar Cambios")}
          </ModalButton>
        </>
      }
    >
        <form id="edit-tenant-form" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">{t("tenants.modal.company_name", "Nombre de la Empresa")}</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-reply-bg dark:bg-reply-surface-dark border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-white font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">{t("tenants.modal.assign_plan", "Plan de Suscripción")}</label>
                <select
                  value={formData.planId}
                  onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
                  className="w-full px-4 py-3 bg-reply-bg dark:bg-reply-surface-dark border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-white"
                >
                  <option value="">{t("tenants.modal.no_plan_label", "-- Sin Plan (Gratuito) --")}</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — ${p.price}/mes</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">{t("tenants.modal.subscription_end", "Fin de Suscripción")}</label>
                <input
                  type="date"
                  value={formData.subscriptionEndsAt}
                  onChange={(e) => setFormData({ ...formData, subscriptionEndsAt: e.target.value })}
                  className="w-full px-4 py-3 bg-reply-bg dark:bg-reply-surface-dark border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">{t("tenants.modal.slug", "Slug (URL)")}</label>
                <input
                  type="text"
                  required
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  className="w-full px-4 py-3 bg-reply-bg dark:bg-reply-surface-dark border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">{t("tenants.modal.account_status", "Estado de la Cuenta")}</label>
                <div className="grid grid-cols-1 gap-2">
                  {["ACTIVE", "TRIAL", "OVERDUE", "BANNED"].map((status) => (
                    <label key={status} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${formData.status === status ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500" : "bg-white dark:bg-reply-panel-dark border-gray-200 dark:border-gray-600"}`}>
                      <input
                        type="radio"
                        name="status"
                        value={status}
                        checked={formData.status === status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as CompanyStatus })}
                        className="w-4 h-4 text-indigo-600"
                      />
                      <span className="font-bold text-sm uppercase">{status}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </form>
    </Modal>
  );
};
