import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Modal, ModalButton } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Building2 } from "lucide-react";
import { getContacts } from "@/services/crmService";
import {
  createProperty,
  updateProperty,
  getPropertyCatalog,
} from "@/services/propertyService";
import { PropertyGalleryUploader } from "./PropertyGalleryUploader";
import {
  type Property,
  type PropertyCatalog,
  type CreatePropertyPayload,
  OPERATION_LABELS,
  KIND_LABELS,
  STATUS_LABELS,
  CONDITION_LABELS,
} from "@/types/property.types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  property: Property | null; // null = crear
  onSaved: (property: Property) => void;
}

type FormState = Partial<CreatePropertyPayload> & {
  features?: string[];
  amenities?: string[];
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="space-y-3">
    <h4 className="text-sm font-bold text-reply-brand uppercase tracking-wide border-b border-gray-100 dark:border-gray-700 pb-1">
      {title}
    </h4>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode; full?: boolean }> = ({
  label,
  children,
  full,
}) => (
  <label className={`block ${full ? "sm:col-span-2" : ""}`}>
    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</span>
    <div className="mt-1">{children}</div>
  </label>
);

const selectCls =
  "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-reply-brand outline-none";

const num = (v: string): number | undefined => (v === "" ? undefined : Number(v));

export const PropertyFormModal: React.FC<Props> = ({
  isOpen,
  onClose,
  property,
  onSaved,
}) => {
  const [catalog, setCatalog] = useState<PropertyCatalog | null>(null);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [current, setCurrent] = useState<Property | null>(property);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({});

  useEffect(() => {
    if (!isOpen) return;
    getPropertyCatalog()
      .then(setCatalog)
      .catch(() =>
        toast.error(
          "No se pudieron cargar las características y ubicaciones. Algunos filtros no estarán disponibles.",
        ),
      );
    getContacts()
      .then((r) => setContacts(r.contacts.map((c) => ({ id: c.id, name: c.name }))))
      .catch(() =>
        toast.error("No se pudo cargar la lista de contactos para asignar propietario."),
      );
  }, [isOpen]);

  useEffect(() => {
    setCurrent(property);
    setForm(
      property
        ? { ...property }
        : {
            operation: "VENTA",
            kind: "APARTAMENTO",
            status: "BORRADOR",
            currency: "COP",
            country: "Colombia",
            features: [],
            amenities: [],
          },
    );
  }, [property, isOpen]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const toggleArray = (field: "features" | "amenities", value: string) => {
    const list = form[field] ?? [];
    set({
      [field]: list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value],
    } as Partial<FormState>);
  };

  const cities = useMemo(
    () => (form.department && catalog ? catalog.cities[form.department] ?? [] : []),
    [form.department, catalog],
  );

  const handleSubmit = async () => {
    if (!form.title || form.title.trim().length < 3) {
      toast.error("El título es requerido (mín. 3 caracteres)");
      return;
    }
    if (form.price === undefined || form.price === null) {
      toast.error("El precio es requerido");
      return;
    }
    setSaving(true);
    try {
      const payload = form as CreatePropertyPayload;
      const saved = current?.id
        ? await updateProperty(current.id, payload)
        : await createProperty(payload);
      setCurrent(saved);
      onSaved(saved);
      toast.success(
        current?.id ? "Inmueble actualizado" : `Inmueble creado (${saved.reference})`,
      );
      if (current?.id) onClose(); // en edición: cerramos; en creación dejamos abierto para fotos
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={current?.id ? `Editar ${current.reference}` : "Nuevo inmueble"}
      subtitle={current?.id ? current.title : "Registra una propiedad"}
      icon={<Building2 className="w-5 h-5 text-white" />}
      size="xl"
      busy={saving}
      footer={
        <>
          <ModalButton variant="secondary" onClick={onClose} disabled={saving}>
            {current?.id ? "Cerrar" : "Cancelar"}
          </ModalButton>
          <ModalButton variant="primary" onClick={handleSubmit} loading={saving}>
            {current?.id ? "Guardar cambios" : "Crear inmueble"}
          </ModalButton>
        </>
      }
    >
      <div className="space-y-6">
        {/* BÁSICO */}
        <Section title="Información básica">
          <Field label="Título" full>
            <Input
              value={form.title ?? ""}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Apartamento amplio en Chapinero"
            />
          </Field>
          <Field label="Tipo de negocio">
            <select
              className={selectCls}
              value={form.operation}
              onChange={(e) => set({ operation: e.target.value as never })}
            >
              {Object.entries(OPERATION_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo de inmueble">
            <select
              className={selectCls}
              value={form.kind}
              onChange={(e) => set({ kind: e.target.value as never })}
            >
              {Object.entries(KIND_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estado">
            <select
              className={selectCls}
              value={form.status}
              onChange={(e) => set({ status: e.target.value as never })}
            >
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estado físico">
            <select
              className={selectCls}
              value={form.condition ?? ""}
              onChange={(e) => set({ condition: (e.target.value || null) as never })}
            >
              <option value="">—</option>
              {Object.entries(CONDITION_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Descripción" full>
            <textarea
              className={selectCls}
              rows={3}
              value={form.description ?? ""}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="Describe el inmueble, sus espacios y ventajas…"
            />
          </Field>
        </Section>

        {/* PRECIO */}
        <Section title="Precio">
          <Field label="Precio (COP)">
            <Input
              type="number"
              value={form.price ?? ""}
              onChange={(e) => set({ price: num(e.target.value) })}
              placeholder="350000000"
            />
          </Field>
          <Field label="Administración mensual (COP)">
            <Input
              type="number"
              value={form.adminFee ?? ""}
              onChange={(e) => set({ adminFee: num(e.target.value) })}
              placeholder="450000"
            />
          </Field>
          <Field label="Comisión (%)">
            <Input
              type="number"
              value={form.commissionPct ?? ""}
              onChange={(e) => set({ commissionPct: num(e.target.value) })}
              placeholder="3"
            />
          </Field>
          <label className="flex items-center gap-2 mt-6 text-sm">
            <input
              type="checkbox"
              checked={!!form.negotiable}
              onChange={(e) => set({ negotiable: e.target.checked })}
            />
            Precio negociable
          </label>
        </Section>

        {/* ÁREAS Y DISTRIBUCIÓN */}
        <Section title="Áreas y distribución">
          <Field label="Área construida (m²)">
            <Input
              type="number"
              value={form.builtArea ?? ""}
              onChange={(e) => set({ builtArea: num(e.target.value) })}
            />
          </Field>
          <Field label="Área privada (m²)">
            <Input
              type="number"
              value={form.privateArea ?? ""}
              onChange={(e) => set({ privateArea: num(e.target.value) })}
            />
          </Field>
          <Field label="Habitaciones">
            <Input
              type="number"
              value={form.bedrooms ?? ""}
              onChange={(e) => set({ bedrooms: num(e.target.value) })}
            />
          </Field>
          <Field label="Baños">
            <Input
              type="number"
              step="0.5"
              value={form.bathrooms ?? ""}
              onChange={(e) => set({ bathrooms: num(e.target.value) })}
            />
          </Field>
          <Field label="Parqueaderos">
            <Input
              type="number"
              value={form.parkingSpots ?? ""}
              onChange={(e) => set({ parkingSpots: num(e.target.value) })}
            />
          </Field>
          <Field label="Estrato (1-6)">
            <select
              className={selectCls}
              value={form.stratum ?? ""}
              onChange={(e) => set({ stratum: num(e.target.value) })}
            >
              <option value="">—</option>
              {[1, 2, 3, 4, 5, 6].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Piso / nivel">
            <Input
              type="number"
              value={form.floor ?? ""}
              onChange={(e) => set({ floor: num(e.target.value) })}
            />
          </Field>
          <Field label="Año de construcción">
            <Input
              type="number"
              value={form.yearBuilt ?? ""}
              onChange={(e) => set({ yearBuilt: num(e.target.value) })}
            />
          </Field>
        </Section>

        {/* UBICACIÓN */}
        <Section title="Ubicación">
          <Field label="Departamento">
            <select
              className={selectCls}
              value={form.department ?? ""}
              onChange={(e) => set({ department: e.target.value, city: "" })}
            >
              <option value="">—</option>
              {catalog?.departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ciudad / Municipio">
            {cities.length > 0 ? (
              <select
                className={selectCls}
                value={form.city ?? ""}
                onChange={(e) => set({ city: e.target.value })}
              >
                <option value="">—</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                value={form.city ?? ""}
                onChange={(e) => set({ city: e.target.value })}
              />
            )}
          </Field>
          <Field label="Barrio / Zona">
            <Input
              value={form.neighborhood ?? ""}
              onChange={(e) => set({ neighborhood: e.target.value })}
            />
          </Field>
          <Field label="Dirección">
            <Input
              value={form.address ?? ""}
              onChange={(e) => set({ address: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={!!form.addressVisible}
              onChange={(e) => set({ addressVisible: e.target.checked })}
            />
            Mostrar dirección exacta en la ficha pública
          </label>
        </Section>

        {/* LEGAL */}
        <Section title="Legal y captación">
          <Field label="Matrícula inmobiliaria">
            <Input
              value={form.registryNumber ?? ""}
              onChange={(e) => set({ registryNumber: e.target.value })}
              placeholder="50N-20123456"
            />
          </Field>
          <Field label="Cédula catastral">
            <Input
              value={form.cadastralNumber ?? ""}
              onChange={(e) => set({ cadastralNumber: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm mt-2">
            <input
              type="checkbox"
              checked={!!form.isExclusive}
              onChange={(e) => set({ isExclusive: e.target.checked })}
            />
            Captación exclusiva
          </label>
        </Section>

        {/* CARACTERÍSTICAS */}
        {catalog && (
          <Section title="Características y amenidades">
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold text-gray-500 mb-1">Del inmueble</p>
              <div className="flex flex-wrap gap-1.5">
                {catalog.features.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleArray("features", f)}
                    className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                      form.features?.includes(f)
                        ? "bg-reply-brand text-white border-reply-brand"
                        : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2 mt-2">
              <p className="text-xs font-semibold text-gray-500 mb-1">Del conjunto</p>
              <div className="flex flex-wrap gap-1.5">
                {catalog.amenities.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleArray("amenities", a)}
                    className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                      form.amenities?.includes(a)
                        ? "bg-reply-brand text-white border-reply-brand"
                        : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </Section>
        )}

        {/* PROPIETARIO */}
        <Section title="Propietario y multimedia">
          <Field label="Propietario (contacto)">
            <select
              className={selectCls}
              value={form.ownerContactId ?? ""}
              onChange={(e) => set({ ownerContactId: e.target.value || null })}
            >
              <option value="">— Sin asignar —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Video (URL)">
            <Input
              value={form.videoUrl ?? ""}
              onChange={(e) => set({ videoUrl: e.target.value || null })}
              placeholder="https://youtube.com/…"
            />
          </Field>
          <Field label="Tour virtual (URL)" full>
            <Input
              value={form.virtualTourUrl ?? ""}
              onChange={(e) => set({ virtualTourUrl: e.target.value || null })}
              placeholder="https://my.matterport.com/…"
            />
          </Field>
        </Section>

        {/* GALERÍA — solo tras crear */}
        <Section title="Galería de fotos">
          {current?.id ? (
            <div className="sm:col-span-2">
              <PropertyGalleryUploader
                propertyId={current.id}
                images={current.images ?? []}
                onChange={(images) => {
                  const updated = { ...current, images };
                  setCurrent(updated);
                  onSaved(updated);
                }}
              />
            </div>
          ) : (
            <p className="sm:col-span-2 text-sm text-gray-500 italic">
              Guarda el inmueble para habilitar la subida de fotos.
            </p>
          )}
        </Section>
      </div>
    </Modal>
  );
};
