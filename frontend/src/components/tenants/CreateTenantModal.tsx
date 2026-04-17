import React, { useState } from "react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/services/apiConfig";
import { Plan } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  availablePlans: Plan[];
}

export const CreateTenantModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  availablePlans,
}) => {
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanySlug, setNewCompanySlug] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [newCompanyPlanId, setNewCompanyPlanId] = useState("free");
  const [newCompanyLogoUrl, setNewCompanyLogoUrl] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const resetModal = () => {
    setNewCompanyName("");
    setNewCompanySlug("");
    setNewAdminEmail("");
    setNewAdminPassword("");
    setNewCompanyPlanId("free");
    setNewCompanyLogoUrl("");
  };

  const handleCreateCompany = async () => {
    if (!newCompanyName || !newCompanySlug || !newAdminEmail || !newAdminPassword) {
      toast.error("Todos los campos excepto el logo son requeridos.");
      return;
    }
    setIsCreating(true);
    try {
      const response = await fetch(`${API_BASE_URL}/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: newCompanyName,
          slug: newCompanySlug,
          adminEmail: newAdminEmail,
          adminPassword: newAdminPassword,
          plan: newCompanyPlanId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Error en la solicitud.");
      }
      
      toast.success("Empresa creada exitosamente.");
      onSuccess();
      onClose();
      resetModal();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Error al crear la empresa.";
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm">
      <div className="bg-white dark:bg-reply-panel-dark rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-200 dark:border-reply-border-dark">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-reply-border-dark">
          <h3 className="font-bold text-lg text-gray-800 dark:text-white">
            Crear Nueva Empresa
          </h3>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nombre de la Empresa
            </label>
            <input
              type="text"
              value={newCompanyName}
              onChange={(e) => {
                setNewCompanyName(e.target.value);
                setNewCompanySlug(
                  e.target.value
                    .toLowerCase()
                    .replace(/\s+/g, "-")
                    .replace(/[^a-z0-9-]/g, ""),
                );
              }}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-lg px-3 py-2 text-gray-900 dark:text-white"
              placeholder="Ej: Acme Corp"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Slug (URL única)
            </label>
            <input
              type="text"
              value={newCompanySlug}
              onChange={(e) =>
                setNewCompanySlug(
                  e.target.value
                    .toLowerCase()
                    .replace(/\s+/g, "-")
                    .replace(/[^a-z0-9-]/g, ""),
                )
              }
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-lg px-3 py-2 text-gray-900 dark:text-white font-mono"
            />
          </div>
          <div className="pt-2 border-t border-gray-200 dark:border-reply-border-dark">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Correo del Administrador
            </label>
            <input
              type="email"
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-lg px-3 py-2 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Contraseña Inicial
            </label>
            <input
              type="password"
              value={newAdminPassword}
              onChange={(e) => setNewAdminPassword(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-lg px-3 py-2 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Asignar Plan
            </label>
            <select
              value={newCompanyPlanId}
              onChange={(e) => setNewCompanyPlanId(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-lg px-3 py-2 text-gray-900 dark:text-white"
            >
              {availablePlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} (${plan.price}/mes)
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="p-4 bg-gray-50 dark:bg-reply-border-dark flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreateCompany}
            disabled={isCreating}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-sm disabled:opacity-50"
          >
            {isCreating ? "Creando..." : "Confirmar y Crear"}
          </button>
        </div>
      </div>
    </div>
  );
};
