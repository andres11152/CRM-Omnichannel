import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Home, MapPin, Building, Ruler } from "lucide-react";
import { getProperties, updateProperty } from "@/services/propertyService";
import { type Property } from "@/types/property.types";
import { Button } from "@/components/ui/Button";
import { formatCOP } from "@/types/property.types";
import { toast } from "sonner";

interface Props {
  dealId: string;
  onPropertiesChanged?: () => void;
}

export const DealPropertiesTab: React.FC<Props> = ({ dealId, onPropertiesChanged }) => {
  const { t } = useTranslation();
  const [associatedProperties, setAssociatedProperties] = useState<Property[]>([]);
  const [catalog, setCatalog] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states to link property
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [linking, setLinking] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get all active properties for this tenant
      const response = await getProperties({ limit: 100 });
      const allProps = response.items;

      // Filter properties currently associated with this deal
      const assigned = allProps.filter((p) => p.dealId === dealId);
      // Filter properties not associated to other deals
      const unassigned = allProps.filter((p) => !p.dealId || p.dealId === dealId);

      setAssociatedProperties(assigned);
      setCatalog(unassigned);
    } catch (error) {
      console.error("Error loading deal properties:", error);
      toast.error("Error al cargar los inmuebles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dealId]);

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPropertyId) return;
    setLinking(true);
    try {
      // Connect property to this deal by updating its dealId
      await updateProperty(selectedPropertyId, { dealId });
      toast.success("Inmueble asociado al trato");
      setSelectedPropertyId("");
      await loadData();
      if (onPropertiesChanged) onPropertiesChanged();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo asociar el inmueble");
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (propertyId: string) => {
    try {
      // Disconnect property by setting dealId to null
      await updateProperty(propertyId, { dealId: null });
      toast.success("Inmueble desvinculado");
      await loadData();
      if (onPropertiesChanged) onPropertiesChanged();
    } catch (error) {
      console.error(error);
      toast.error("Error al desvincular el inmueble");
    }
  };

  if (loading) {
    return <div className="text-center py-6 text-sm text-gray-500">{t("common.loading")}...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Associate Property Selector Form */}
      <form onSubmit={handleLink} className="bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/60 p-4 rounded-xl space-y-4">
        <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
          <Building className="w-4 h-4 text-indigo-500" />
          Vincular Inmueble Inmobiliario a Oportunidad
        </h4>
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 flex flex-col gap-1">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Seleccionar Inmueble</span>
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">-- Seleccionar inmueble del catálogo --</option>
              {catalog
                .filter((p) => p.dealId !== dealId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.reference} - {p.title} ({p.city || "Sin ciudad"}) — {formatCOP(p.price, p.currency)}
                  </option>
                ))}
            </select>
          </div>
          <Button
            type="submit"
            disabled={!selectedPropertyId || linking}
            className="w-full sm:w-auto py-2 px-6 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="w-4 h-4" />
            Asociar Ficha
          </Button>
        </div>
      </form>

      {/* Associated Properties List */}
      {associatedProperties.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <Home className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-xs text-gray-500">No hay inmuebles asociados a esta oportunidad.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {associatedProperties.map((p) => {
            const cover = p.images?.find((img) => img.isCover)?.url || p.images?.[0]?.url;
            return (
              <div key={p.id} className="flex gap-4 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-md transition-shadow relative group">
                <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden flex-shrink-0">
                  {cover ? (
                    <img src={cover} alt={p.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <Home className="w-8 h-8" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {p.reference}
                  </span>
                  <h5 className="font-semibold text-sm text-gray-800 dark:text-gray-150 truncate pt-0.5">{p.title}</h5>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    {p.neighborhood ? `${p.neighborhood}, ` : ""}{p.city || "Sin ubicación"}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] text-gray-400">
                    {p.builtArea && <span className="flex items-center gap-0.5"><Ruler className="w-3 h-3" />{p.builtArea} m²</span>}
                    <span className="font-bold text-gray-800 dark:text-gray-200">{formatCOP(p.price, p.currency)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnlink(p.id)}
                  className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors opacity-0 group-hover:opacity-100"
                  title="Desvincular Inmueble"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
