import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Search, UserRound, ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { getContacts, CrmContact } from "@/services/crmService";

export interface ContactPickerProps {
  onClose: () => void;
  onSelect: (contact: CrmContact) => void;
}

export const ContactPicker: React.FC<ContactPickerProps> = ({ onClose, onSelect }) => {
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await getContacts({ search: query || undefined, limit: 20 });
        if (cancelled) return;
        setContacts(res.contacts.filter((c) => !!c.phone));
      } catch (error) {
        if (!cancelled) {
          console.error("Error fetching contacts:", error);
          toast.error(t("actions.err_contacts", "Error cargando contactos"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, t]);

  return (
    <Modal isOpen onClose={onClose} title={t("actions.contact_title", "Enviar Contacto")} size="md">
      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
        <div className="sticky top-0 z-10 bg-white dark:bg-[#1f2c34] pb-2 space-y-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("actions.contact_search_placeholder", "Buscar por nombre o teléfono…")}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-white/5 focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
              <UserRound className="absolute inset-0 m-auto w-5 h-5 text-indigo-500 animate-pulse" />
            </div>
            <p className="text-sm font-bold text-gray-400 animate-pulse">{t("actions.loading_contacts", "Cargando contactos...")}</p>
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 text-gray-400">
              <UserRound size={32} />
            </div>
            <p className="font-black text-gray-800 dark:text-gray-100">{t("actions.no_contacts", "No hay contactos")}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-[220px]">
              {t("actions.no_contacts_desc", "Ajusta la búsqueda o crea contactos con teléfono en el módulo de Contactos.")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 pb-4">
            {contacts.map((c) => (
              <div
                key={c.id}
                onClick={() => onSelect(c)}
                className="group flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-gray-800/40 border border-gray-100 dark:border-white/5 hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-500/10 cursor-pointer transition-all active:scale-[0.98]"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-indigo-900/30 flex items-center justify-center shrink-0">
                  <UserRound className="w-5 h-5 text-indigo-400 dark:text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-black text-gray-800 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                    {c.name}
                  </h4>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">{c.phone}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
