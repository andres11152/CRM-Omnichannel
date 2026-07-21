import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Search, Building2, ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { getProperties } from "@/services/propertyService";
import type { Property } from "@/types/property.types";
import { formatCOP, STATUS_COLORS } from "@/types/property.types";
import { usePropertyLabels } from "@/hooks/usePropertyLabels";

export interface PropertyPickerProps {
  onClose: () => void;
  onSelect: (property: Property) => void;
}

export const PropertyPicker: React.FC<PropertyPickerProps> = ({ onClose, onSelect }) => {
  const [query, setQuery] = useState("");
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();
  const { STATUS_LABELS } = usePropertyLabels();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await getProperties({ q: query || undefined, limit: 20, sort: "newest" });
        if (cancelled) return;
        setProperties(res.items.filter((p) => p.status !== "BORRADOR"));
      } catch (error) {
        if (!cancelled) {
          console.error("Error fetching properties:", error);
          toast.error(t("actions.err_properties", "Error cargando inmuebles"));
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
    <Modal isOpen onClose={onClose} title={t("actions.property_title", "Catálogo de Inmuebles")} size="md">
      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
        <div className="sticky top-0 z-10 bg-white dark:bg-reply-elevated-dark pb-2 space-y-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("actions.property_search_placeholder", "Buscar por título, ciudad, barrio, referencia…")}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-white/5 focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
              <Building2 className="absolute inset-0 m-auto w-5 h-5 text-indigo-500 animate-pulse" />
            </div>
            <p className="text-sm font-bold text-gray-400 animate-pulse">{t("actions.loading_catalog", "Cargando catálogo...")}</p>
          </div>
        ) : properties.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 text-gray-400">
              <Building2 size={32} />
            </div>
            <p className="font-black text-gray-800 dark:text-gray-100">{t("actions.no_properties", "No hay inmuebles")}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-[220px]">
              {t("actions.no_properties_desc", "Ajusta la búsqueda o crea inmuebles en el módulo de Propiedades.")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 pb-4">
            {properties.map((p) => {
              const cover = p.images.find((img) => img.isCover) || p.images[0];
              const location = [p.neighborhood, p.city].filter(Boolean).join(", ");
              return (
                <div
                  key={p.id}
                  onClick={() => onSelect(p)}
                  className="group flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-gray-800/40 border border-gray-100 dark:border-white/5 hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-500/10 cursor-pointer transition-all active:scale-[0.98]"
                >
                  <div className="relative w-20 h-20 shrink-0">
                    {cover ? (
                      <img
                        src={cover.url}
                        alt={p.title}
                        className="w-full h-full rounded-xl object-cover shadow-sm bg-gray-100"
                      />
                    ) : (
                      <div className="w-full h-full rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-indigo-900/30 flex items-center justify-center">
                        <Building2 className="w-8 h-8 text-indigo-400 dark:text-indigo-600" />
                      </div>
                    )}
                    <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-black/5 dark:ring-white/5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h4 className="font-black text-gray-800 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                        {p.title}
                      </h4>
                      <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide ${STATUS_COLORS[p.status]}`}>
                        {STATUS_LABELS[p.status]}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1 mb-2 font-medium">
                      {location || t("actions.no_location", "Ubicación sin especificar")}
                      {p.reference ? ` · Ref. ${p.reference}` : ""}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20">
                        {formatCOP(p.price, p.currency)}
                      </span>
                      <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};
