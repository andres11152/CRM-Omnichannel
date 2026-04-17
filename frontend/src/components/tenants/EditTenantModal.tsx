import React, { useState } from "react";
import { Company, Plan, CompanyStatus } from "@/types";

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white dark:bg-reply-panel-dark rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-200 dark:border-reply-border-dark flex flex-col max-h-[90vh]">
        <div className="px-8 py-5 border-b border-gray-100 dark:border-reply-border-dark bg-reply-bg dark:bg-reply-surface-dark flex justify-between items-center">
          <div>
            <h3 className="font-bold text-xl text-gray-800 dark:text-white flex items-center gap-2">
              <span className="text-2xl"></span> Editar Empresa
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Modificando configuración para <span className="font-bold text-indigo-600 dark:text-indigo-400">{company.name}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">Nombre de la Empresa</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-reply-bg dark:bg-reply-surface-dark border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-white font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">Plan de Suscripción</label>
                <select
                  value={formData.planId}
                  onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
                  className="w-full px-4 py-3 bg-reply-bg dark:bg-reply-surface-dark border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-white"
                >
                  <option value="">-- Sin Plan (Gratuito) --</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — ${p.price}/mes</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">Fin de Suscripción</label>
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
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">Slug (URL)</label>
                <input
                  type="text"
                  required
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  className="w-full px-4 py-3 bg-reply-bg dark:bg-reply-surface-dark border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">Estado de la Cuenta</label>
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

          <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-100 dark:border-reply-border-dark">
            <button type="button" onClick={onClose} className="px-6 py-2.5 text-gray-600 dark:text-gray-300 font-bold">Cancelar</button>
            <button type="submit" disabled={isSaving} className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30 disabled:opacity-70">
              {isSaving ? "Guardando..." : "Guardar Cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
