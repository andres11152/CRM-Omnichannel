import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Account } from "@/types/crm";
import { createAccount, updateAccount } from "@/services/crmService";
import {
  Building2,
  Globe,
  Mail,
  MapPin,
  Activity,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  TrendingDown,
} from "lucide-react";
import { Modal, ModalButton } from "@/components/ui/Modal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  account?: Account;
}

export const AccountModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSave,
  account,
}) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<Account>>({
    name: "",
    industry: "",
    website: "",
    email: "",
    size: "",
    address: "",
    status: "ACTIVE",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (account) {
      setFormData({
        name: account.name,
        industry: account.industry || "",
        website: account.website || "",
        email: account.email || "",
        size: account.size || "",
        address: account.address || "",
        status: account.status,
      });
    } else {
      setFormData({
        name: "",
        industry: "",
        website: "",
        email: "",
        size: "",
        address: "",
        status: "ACTIVE",
      });
    }
  }, [account]);

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();
    setLoading(true);

    // Normalize URL if needed
    let finalData = { ...formData };
    if (
      finalData.website &&
      !finalData.website.startsWith("http") &&
      finalData.website.includes(".")
    ) {
      finalData.website = `https://${finalData.website}`;
    }

    try {
      if (account) {
        await updateAccount(account.id, finalData);
      } else {
        await createAccount(finalData);
      }
      onSave();
    } catch (error) {
      console.error("Error saving account:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={account ? t("crm.accounts.edit_title") : t("crm.accounts.new_title")}
      subtitle={account ? t("crm.accounts.edit_desc") : t("crm.accounts.new_desc")}
      icon={<Building2 size={22} className="text-indigo-600 dark:text-indigo-400" />}
      size="xl"
      busy={loading}
      footer={
        <>
          <ModalButton variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </ModalButton>
          <ModalButton
            variant="primary"
            type="submit"
            form="account-form"
            loading={loading}
            disabled={!formData.name}
          >
            {!loading && <Building2 size={16} />}
            {account ? t("common.save") : t("common.new")}
          </ModalButton>
        </>
      }
    >
        {/* Form Content */}
        <form id="account-form" onSubmit={handleSubmit} className="space-y-8">
          {/* Section 1: Basic Information */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 border-b border-gray-100 dark:border-reply-border-dark pb-2">
              <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-600">
                <Briefcase size={16} />
              </div>
              <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">{t("crm.accounts.basic_info")}</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                  {t("crm.accounts.name")} <span className="text-rose-500">*</span>
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-indigo-500">
                    <Building2 size={18} />
                  </div>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-100 dark:border-reply-border-dark bg-gray-50/50 dark:bg-reply-surface-dark/50 text-gray-900 dark:text-white font-bold text-sm focus:bg-white dark:focus:bg-reply-surface-dark focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all outline-none"
                    placeholder="Ej. Acme Global Systems"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                  {t("crm.accounts.industry")}
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-indigo-500">
                    <Activity size={18} />
                  </div>
                  <input
                    type="text"
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-100 dark:border-reply-border-dark bg-gray-50/50 dark:bg-reply-surface-dark/50 text-gray-900 dark:text-white font-bold text-sm focus:bg-white dark:focus:bg-reply-surface-dark focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all outline-none"
                    placeholder="Ej. FinTech, Retail..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                  {t("crm.accounts.size")}
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-indigo-500 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                  <select
                    value={formData.size}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                    className="w-full pl-12 pr-10 py-3.5 rounded-2xl border border-gray-100 dark:border-reply-border-dark bg-gray-50/50 dark:bg-reply-surface-dark/50 text-gray-900 dark:text-white font-bold text-sm focus:bg-white dark:focus:bg-reply-surface-dark focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all outline-none appearance-none"
                  >
                    <option value="">{t("crm.accounts.size_placeholder")}</option>
                    <option value="1-10">1-10 {t("team.table.agent").toLowerCase()}s (Startup)</option>
                    <option value="11-50">11-50 {t("team.table.agent").toLowerCase()}s (SMB)</option>
                    <option value="51-200">51-200 {t("team.table.agent").toLowerCase()}s (Mid-Market)</option>
                    <option value="201-500">201-500 {t("team.table.agent").toLowerCase()}s (Large)</option>
                    <option value="500+">500+ {t("team.table.agent").toLowerCase()}s (Enterprise)</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Contact & Location */}
          <section className="space-y-6 pt-4">
            <div className="flex items-center gap-2 border-b border-gray-100 dark:border-reply-border-dark pb-2">
              <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-600">
                <Globe size={16} />
              </div>
              <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">{t("crm.accounts.contact_location")}</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                  {t("crm.accounts.website")}
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-indigo-500">
                    <Globe size={18} />
                  </div>
                  <input
                    type="text"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-100 dark:border-reply-border-dark bg-gray-50/50 dark:bg-reply-surface-dark/50 text-gray-900 dark:text-white font-bold text-sm focus:bg-white dark:focus:bg-reply-surface-dark focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all outline-none"
                    placeholder="empresa.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                  {t("crm.accounts.email")}
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-indigo-500">
                    <Mail size={18} />
                  </div>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-100 dark:border-reply-border-dark bg-gray-50/50 dark:bg-reply-surface-dark/50 text-gray-900 dark:text-white font-bold text-sm focus:bg-white dark:focus:bg-reply-surface-dark focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all outline-none"
                    placeholder="contacto@empresa.com"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                  {t("crm.accounts.address")}
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-4 text-gray-400 transition-colors group-focus-within:text-indigo-500">
                    <MapPin size={18} />
                  </div>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-100 dark:border-reply-border-dark bg-gray-50/50 dark:bg-reply-surface-dark/50 text-gray-900 dark:text-white font-bold text-sm focus:bg-white dark:focus:bg-reply-surface-dark focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all outline-none resize-none"
                    rows={2}
                    placeholder="Ciudad, País, Dirección completa..."
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Status Selection */}
          <section className="space-y-6 pt-4 pb-4">
            <div className="flex items-center gap-2 border-b border-gray-100 dark:border-reply-border-dark pb-2">
              <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-600">
                <Activity size={16} />
              </div>
              <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">{t("tenants.metrics.status")}</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, status: "LEAD" })}
                className={`group flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all duration-300 relative overflow-hidden ${
                  formData.status === "LEAD"
                    ? "bg-indigo-600/5 border-indigo-500 text-indigo-700 dark:text-indigo-400 ring-4 ring-indigo-500/10"
                    : "border-gray-100 dark:border-reply-border-dark hover:border-indigo-500/30 text-gray-500 dark:text-gray-400"
                }`}
              >
                <div className={`p-2 rounded-xl ${formData.status === "LEAD" ? "bg-indigo-500 text-white" : "bg-gray-100 dark:bg-reply-surface-dark text-gray-400 group-hover:text-indigo-500"} transition-colors shadow-sm`}>
                  <TrendingDown size={20} className="rotate-180" />
                </div>
                <div className="text-center">
                  <div className="text-xs font-black uppercase tracking-widest">{t("crm.accounts.status.lead")}</div>
                  <div className="text-[10px] opacity-60 font-medium">{t("crm.accounts.status_desc.lead")}</div>
                </div>
                {formData.status === "LEAD" && <div className="absolute top-2 right-2 text-indigo-500 animate-in zoom-in"><CheckCircle2 size={14} /></div>}
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, status: "ACTIVE" })}
                className={`group flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all duration-300 relative overflow-hidden ${
                  formData.status === "ACTIVE"
                    ? "bg-emerald-600/5 border-emerald-500 text-emerald-700 dark:text-emerald-400 ring-4 ring-emerald-500/10"
                    : "border-gray-100 dark:border-reply-border-dark hover:border-emerald-500/30 text-gray-500 dark:text-gray-400"
                }`}
              >
                <div className={`p-2 rounded-xl ${formData.status === "ACTIVE" ? "bg-emerald-500 text-white" : "bg-gray-100 dark:bg-reply-surface-dark text-gray-400 group-hover:text-emerald-500"} transition-colors shadow-sm`}>
                  <CheckCircle2 size={20} />
                </div>
                <div className="text-center">
                  <div className="text-xs font-black uppercase tracking-widest">{t("crm.accounts.status.active")}</div>
                  <div className="text-[10px] opacity-60 font-medium">{t("crm.accounts.status_desc.active")}</div>
                </div>
                {formData.status === "ACTIVE" && <div className="absolute top-2 right-2 text-emerald-500 animate-in zoom-in"><CheckCircle2 size={14} /></div>}
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, status: "CHURNED" })}
                className={`group flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all duration-300 relative overflow-hidden ${
                  formData.status === "CHURNED"
                    ? "bg-rose-600/5 border-rose-500 text-rose-700 dark:text-rose-400 ring-4 ring-rose-500/10"
                    : "border-gray-100 dark:border-reply-border-dark hover:border-rose-500/30 text-gray-500 dark:text-gray-400"
                }`}
              >
                <div className={`p-2 rounded-xl ${formData.status === "CHURNED" ? "bg-rose-500 text-white" : "bg-gray-100 dark:bg-reply-surface-dark text-gray-400 group-hover:text-rose-500"} transition-colors shadow-sm`}>
                  <AlertCircle size={20} />
                </div>
                <div className="text-center">
                  <div className="text-xs font-black uppercase tracking-widest">{t("crm.accounts.status.churned")}</div>
                  <div className="text-[10px] opacity-60 font-medium">{t("crm.accounts.status_desc.churned")}</div>
                </div>
                {formData.status === "CHURNED" && <div className="absolute top-2 right-2 text-rose-500 animate-in zoom-in"><CheckCircle2 size={14} /></div>}
              </button>
            </div>
          </section>
        </form>
    </Modal>
  );
};


