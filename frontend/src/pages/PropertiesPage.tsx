import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Plus, Search, MapPin, BedDouble, Bath, Car, Ruler, Trash2, Globe } from "lucide-react";
import { ModuleHeader } from "@/components/common/ModuleHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useModal } from "@/context/ModalContext";
import { PropertyFormModal } from "@/components/properties/PropertyFormModal";
import { PropertyDetailDrawer } from "@/components/properties/PropertyDetailDrawer";
import {
  getProperties,
  deleteProperty,
} from "@/services/propertyService";
import {
  type Property,
  type PropertyFilters,
  OPERATION_LABELS,
  KIND_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
  PROPERTY_KIND_GROUPS,
  formatCOP,
} from "@/types/property.types";

const selectCls =
  "px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-reply-brand outline-none";

const PropertyCard: React.FC<{
  property: Property;
  onOpen: () => void;
  onDelete: () => void;
}> = ({ property, onOpen, onDelete }) => {
  const cover =
    property.images?.find((i) => i.isCover)?.url || property.images?.[0]?.url;

  return (
    <div className="group bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-xl transition-shadow">
      <div
        className="relative aspect-[4/3] bg-gray-100 dark:bg-gray-700 cursor-pointer"
        onClick={onOpen}
      >
        {cover ? (
          <img src={cover} alt={property.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <Building2 className="w-12 h-12" />
          </div>
        )}
        <div className="absolute top-2 left-2 flex gap-1.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[property.status]}`}>
            {STATUS_LABELS[property.status]}
          </span>
          {property.isPublished && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white flex items-center gap-1">
              <Globe className="w-3 h-3" /> Público
            </span>
          )}
        </div>
        <span className="absolute bottom-2 right-2 text-[10px] font-mono bg-black/60 text-white px-1.5 py-0.5 rounded">
          {property.reference}
        </span>
      </div>

      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-lg font-black text-reply-brand leading-tight">
              {formatCOP(property.price, property.currency)}
            </p>
            <p className="text-xs text-gray-500">
              {OPERATION_LABELS[property.operation]} · {KIND_LABELS[property.kind]}
            </p>
          </div>
          <button
            onClick={onDelete}
            className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
            title="Eliminar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <h3
          onClick={onOpen}
          className="font-semibold text-sm text-gray-800 dark:text-gray-100 truncate cursor-pointer hover:text-reply-brand"
        >
          {property.title}
        </h3>

        {(property.city || property.neighborhood) && (
          <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            {[property.neighborhood, property.city].filter(Boolean).join(", ")}
          </p>
        )}

        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300 pt-1 border-t border-gray-100 dark:border-gray-700">
          {property.bedrooms != null && (
            <span className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5" />{property.bedrooms}</span>
          )}
          {property.bathrooms != null && (
            <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5" />{property.bathrooms}</span>
          )}
          {property.parkingSpots != null && (
            <span className="flex items-center gap-1"><Car className="w-3.5 h-3.5" />{property.parkingSpots}</span>
          )}
          {(property.builtArea ?? property.lotArea) != null && (
            <span className="flex items-center gap-1"><Ruler className="w-3.5 h-3.5" />{property.builtArea ?? property.lotArea}m²</span>
          )}
          {property.stratum != null && (
            <span className="ml-auto text-[10px] font-semibold">Estrato {property.stratum}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export const PropertiesPage: React.FC = () => {
  const { confirm } = useModal();
  const [items, setItems] = useState<Property[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<PropertyFilters>({ page: 1, limit: 24, sort: "newest" });
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [detail, setDetail] = useState<Property | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getProperties(filters);
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar inmuebles");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounce búsqueda
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, q: search || undefined, page: 1 }));
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const setFilter = (patch: Partial<PropertyFilters>) =>
    setFilters((f) => ({ ...f, ...patch, page: 1 }));

  const handleSaved = (saved: Property) => {
    setItems((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...prev];
    });
    if (detail?.id === saved.id) setDetail(saved);
  };

  const handleDelete = async (property: Property) => {
    const ok = await confirm({
      title: "Eliminar inmueble",
      message: `¿Eliminar "${property.title}" (${property.reference})? Esta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      variant: "danger",
    });
    if (!ok) return;
    const prev = items;
    setItems(items.filter((p) => p.id !== property.id)); // optimista
    try {
      await deleteProperty(property.id);
      toast.success("Inmueble eliminado");
    } catch (err) {
      setItems(prev);
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  };

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (p: Property) => {
    setDetail(null);
    setEditing(p);
    setFormOpen(true);
  };

  const publishedCount = useMemo(() => items.filter((p) => p.isPublished).length, [items]);

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark">
      <ModuleHeader
        title="Propiedades"
        description="Gestión inmobiliaria enterprise"
        icon={<Building2 />}
        gradient="from-indigo-600 to-purple-600"
        stats={{ label: "Publicados", value: `${publishedCount}/${total}` }}
        action={
          <Button onClick={openNew} variant="primary">
            <Plus className="w-4 h-4" /> Nuevo inmueble
          </Button>
        }
      />

      {/* Filtros */}
      <div className="px-4 md:px-8 py-3 flex flex-wrap gap-2 items-center border-b border-gray-100 dark:border-gray-800">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, referencia, dirección…"
            className="pl-9"
          />
        </div>
        <select
          className={selectCls}
          value={filters.operation ?? ""}
          onChange={(e) => setFilter({ operation: (e.target.value || undefined) as never })}
        >
          <option value="">Negocio</option>
          {Object.entries(OPERATION_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          className={selectCls}
          value={filters.kind ?? ""}
          onChange={(e) => setFilter({ kind: (e.target.value || undefined) as never })}
        >
          <option value="">Tipo</option>
          {Object.entries(KIND_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          className={selectCls}
          value={filters.status ?? ""}
          onChange={(e) => setFilter({ status: (e.target.value || undefined) as never })}
        >
          <option value="">Estado</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {(!filters.kind || PROPERTY_KIND_GROUPS[filters.kind] !== "COMERCIAL") && (
          <select
            className={selectCls}
            value={filters.stratum ?? ""}
            onChange={(e) => setFilter({ stratum: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">Estrato</option>
            {[1, 2, 3, 4, 5, 6].map((s) => (
              <option key={s} value={s}>Estrato {s}</option>
            ))}
          </select>
        )}
        <select
          className={selectCls}
          value={filters.sort ?? "newest"}
          onChange={(e) => setFilter({ sort: e.target.value as never })}
        >
          <option value="newest">Más recientes</option>
          <option value="price_asc">Precio ↑</option>
          <option value="price_desc">Precio ↓</option>
          <option value="oldest">Más antiguos</option>
        </select>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 h-72" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-20">
            <Building2 className="w-16 h-16 mb-4" />
            <p className="text-lg font-semibold">No hay inmuebles</p>
            <p className="text-sm">Crea tu primer inmueble para empezar</p>
            <Button onClick={openNew} variant="primary" className="mt-4">
              <Plus className="w-4 h-4" /> Nuevo inmueble
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((p) => (
              <PropertyCard
                key={p.id}
                property={p}
                onOpen={() => setDetail(p)}
                onDelete={() => handleDelete(p)}
              />
            ))}
          </div>
        )}
      </div>

      <PropertyFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        property={editing}
        onSaved={handleSaved}
      />

      <PropertyDetailDrawer
        isOpen={!!detail}
        onClose={() => setDetail(null)}
        property={detail}
        onEdit={openEdit}
        onChanged={handleSaved}
      />
    </div>
  );
};
