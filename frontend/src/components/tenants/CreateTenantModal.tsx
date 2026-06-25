import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { API_BASE_URL } from "@/services/apiConfig";
import { Plan } from "@/types";
import {
  Building2,
  Globe,
  Mail,
  Lock,
  Zap,
  ShieldCheck,
  Rocket,
} from "lucide-react";
import { Modal, ModalButton } from "@/components/ui/Modal";

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
  const { t } = useTranslation();
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
    if (
      !newCompanyName ||
      !newCompanySlug ||
      !newAdminEmail ||
      !newAdminPassword
    ) {
      toast.error(
        t(
          "tenants.modal.err_required",
          "Todos los campos excepto el logo son requeridos.",
        ),
      );
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
        throw new Error(
          errorData.message ||
            t("tenants.modal.err_request", "Error en la solicitud."),
        );
      }

      toast.success(
        t("tenants.modal.success_create", "Empresa creada exitosamente."),
      );
      onSuccess();
      onClose();
      resetModal();
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : t("tenants.modal.err_create", "Error al crear la empresa.");
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("tenants.modal.create_title", "Crear Nueva Empresa")}
      subtitle="Onboarding de nuevo tenant SaaS"
      icon={<Rocket size={22} className="text-indigo-600 dark:text-indigo-400" />}
      size="lg"
      busy={isCreating}
      footer={
        <>
          <ModalButton variant="secondary" onClick={onClose}>
            {t("common.cancel", "Cancelar")}
          </ModalButton>
          <ModalButton
            variant="primary"
            onClick={handleCreateCompany}
            loading={isCreating}
            disabled={!newCompanyName || !newAdminEmail}
          >
            {!isCreating && <Rocket size={16} />}
            {isCreating
              ? t("tenants.modal.creating", "Creando...")
              : t("tenants.modal.create_button", "Confirmar y Crear")}
          </ModalButton>
        </>
      }
    >
        {/* Content */}
        <div className="space-y-8">
          {/* Section: Company Identity */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 border-b border-gray-100 dark:border-reply-border-dark pb-2">
              <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-600">
                <Building2 size={16} />
              </div>
              <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">
                Identidad de la Empresa
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                  {t("tenants.modal.company_name", "Nombre de la Empresa")}
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-indigo-500">
                    <Building2 size={18} />
                  </div>
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
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-100 dark:border-reply-border-dark bg-gray-50/50 dark:bg-reply-surface-dark/50 text-gray-900 dark:text-white font-bold text-sm focus:bg-white dark:focus:bg-reply-surface-dark focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all outline-none"
                    placeholder="Ej: Acme Corp"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                  {t("tenants.modal.slug", "Slug (URL única)")}
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-indigo-500">
                    <Globe size={18} />
                  </div>
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
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-100 dark:border-reply-border-dark bg-gray-50/50 dark:bg-reply-surface-dark/50 text-indigo-600 dark:text-indigo-400 font-mono text-sm focus:bg-white dark:focus:bg-reply-surface-dark focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all outline-none"
                    placeholder="acme-corp"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400 uppercase tracking-tighter">
                    .reply.com
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section: Admin Access */}
          <section className="space-y-6 pt-2">
            <div className="flex items-center gap-2 border-b border-gray-100 dark:border-reply-border-dark pb-2">
              <div className="p-1.5 bg-purple-500/10 rounded-lg text-purple-600">
                <ShieldCheck size={16} />
              </div>
              <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">
                Acceso Administrativo
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                  {t("tenants.modal.admin_email", "Email Admin")}
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-indigo-500">
                    <Mail size={18} />
                  </div>
                  <input
                    type="email"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-100 dark:border-reply-border-dark bg-gray-50/50 dark:bg-reply-surface-dark/50 text-gray-900 dark:text-white font-bold text-sm focus:bg-white dark:focus:bg-reply-surface-dark focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all outline-none"
                    placeholder="admin@acme.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                  {t("tenants.modal.admin_password", "Password")}
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-indigo-500">
                    <Lock size={18} />
                  </div>
                  <input
                    type="password"
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-100 dark:border-reply-border-dark bg-gray-50/50 dark:bg-reply-surface-dark/50 text-gray-900 dark:text-white font-bold text-sm focus:bg-white dark:focus:bg-reply-surface-dark focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all outline-none"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Section: Plan Selection */}
          <section className="space-y-6 pt-2">
            <div className="flex items-center gap-2 border-b border-gray-100 dark:border-reply-border-dark pb-2">
              <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-600">
                <Zap size={16} />
              </div>
              <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">
                Plan & Escalabilidad
              </h3>
            </div>

            <div>
              <div className="grid grid-cols-1 gap-3">
                {availablePlans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setNewCompanyPlanId(plan.id)}
                    className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all duration-300 ${
                      newCompanyPlanId === plan.id
                        ? "bg-indigo-600/5 border-indigo-500 ring-4 ring-indigo-500/10"
                        : "border-gray-100 dark:border-reply-border-dark hover:border-indigo-500/30"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-xl ${newCompanyPlanId === plan.id ? "bg-indigo-500 text-white" : "bg-gray-100 dark:bg-reply-surface-dark text-gray-400"}`}
                      >
                        <Zap size={16} />
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-black text-gray-900 dark:text-white">
                          {plan.name}
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">
                          Capacidades Standard
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                        ${plan.price}
                      </div>
                      <div className="text-[9px] text-gray-400 uppercase font-black tracking-widest">
                        /mes
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
    </Modal>
  );
};
