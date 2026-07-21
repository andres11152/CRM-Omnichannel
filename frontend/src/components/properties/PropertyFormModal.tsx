import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Modal, ModalButton } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Building2 } from "lucide-react";
import { getContacts } from "@/services/crmService";
import { usePropertyLabels } from "@/hooks/usePropertyLabels";
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
  type PropertyKind,
  type PropertyAdaptiveField,
  PROPERTY_KIND_GROUPS,
  KIND_FIELDS,
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

/** Tipos donde lo normal es que el inmueble esté dentro de un conjunto/edificio compartido. */
const KINDS_TYPICALLY_IN_COMPLEX = new Set([
  "APARTAMENTO",
  "APARTAESTUDIO",
  "OFICINA",
  "LOCAL_COMERCIAL",
  "EDIFICIO",
]);

/** Valor de reset por campo adaptativo, para limpiar lo que queda oculto al cambiar de tipo. */
const ADAPTIVE_RESET: Record<PropertyAdaptiveField, undefined | null> = {
  builtArea: undefined,
  privateArea: undefined,
  lotArea: undefined,
  bedrooms: undefined,
  bathrooms: undefined,
  parkingSpots: undefined,
  floor: undefined,
  totalFloors: undefined,
  yearBuilt: undefined,
  stratum: undefined,
  condition: null,
  permittedUse: undefined,
  frontage: undefined,
  depth: undefined,
};

export const PropertyFormModal: React.FC<Props> = ({
  isOpen,
  onClose,
  property,
  onSaved,
}) => {
  const { t } = useTranslation();
  const {
    OPERATION_LABELS,
    KIND_LABELS,
    STATUS_LABELS,
    CONDITION_LABELS,
    POWER_TYPE_LABELS,
    KIND_TITLE_PLACEHOLDERS,
  } = usePropertyLabels();
  const [catalog, setCatalog] = useState<PropertyCatalog | null>(null);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [deals, setDeals] = useState<{ id: string; title: string }[]>([]);
  const [current, setCurrent] = useState<Property | null>(property);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({});

  useEffect(() => {
    if (!isOpen) return;
    getPropertyCatalog()
      .then(setCatalog)
      .catch(() =>
        toast.error(
          t(
            "properties_form.catalog_load_error",
            "No se pudieron cargar las características y ubicaciones. Algunos filtros no estarán disponibles.",
          ),
        ),
      );
    getContacts()
      .then((r) => setContacts(r.contacts.map((c) => ({ id: c.id, name: c.name }))))
      .catch(() =>
        toast.error(
          t("properties_form.contacts_load_error", "No se pudo cargar la lista de contactos para asignar propietario."),
        ),
      );
    import("@/services/crmService")
      .then((m) => m.getDeals())
      .then((r) => setDeals(r.deals.map((d) => ({ id: d.id, title: d.title }))))
      .catch(() =>
        toast.error(t("properties_form.deals_load_error", "No se pudieron cargar las oportunidades para la asociación.")),
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
            isInComplex: true,
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

  /**
   * Al cambiar el tipo de inmueble, limpia todos los campos que quedan ocultos
   * para el nuevo tipo (según KIND_FIELDS) — evita guardar datos "invisibles"
   * (p.ej. 3 habitaciones en un parqueadero) que el usuario ya no puede ver
   * ni corregir en el formulario.
   */
  const handleKindChange = (kindValue: string) => {
    const kind = kindValue as PropertyKind;
    const newGroup = PROPERTY_KIND_GROUPS[kind];
    const visible = new Set<PropertyAdaptiveField>(KIND_FIELDS[kind]);
    const patch: Partial<FormState> = {
      kind: kind as never,
      isInComplex: KINDS_TYPICALLY_IN_COMPLEX.has(kindValue),
    };
    (Object.keys(ADAPTIVE_RESET) as PropertyAdaptiveField[]).forEach((field) => {
      if (!visible.has(field)) {
        (patch as Record<string, unknown>)[field] = ADAPTIVE_RESET[field];
      }
    });
    if (newGroup !== "COMERCIAL") {
      // permittedUse ya lo maneja el loop genérico de arriba (vía KIND_FIELDS,
      // que incluye LOTE) — aquí solo van los campos 100% exclusivos de comercial.
      Object.assign(patch, {
        ceilingHeight: undefined,
        hasLoadingDock: false,
        hasShowcase: false,
        isCornerLot: false,
        hasMezzanine: false,
        powerType: null,
      });
    }
    if (newGroup === "OTROS") {
      Object.assign(patch, { features: [], amenities: [] });
    }
    set(patch);
  };

  const group = form.kind ? PROPERTY_KIND_GROUPS[form.kind] : "RESIDENCIAL";
  const isComercial = group === "COMERCIAL";
  // LOTE/PARQUEADERO/OTRO son activos sin espacios habitables: no aplican
  // características ni amenidades (ni del inmueble ni del conjunto).
  const showFeaturesSection = group !== "OTROS";
  /** ¿El tipo actual usa este campo? (matriz KIND_FIELDS) */
  const show = (field: PropertyAdaptiveField): boolean =>
    form.kind ? KIND_FIELDS[form.kind].includes(field) : true;
  const featureOptions = catalog
    ? isComercial
      ? catalog.commercialFeatures
      : catalog.features
    : [];
  const amenityOptions = catalog
    ? isComercial
      ? catalog.commercialAmenities
      : catalog.amenities
    : [];

  const handleSubmit = async () => {
    if (!form.title || form.title.trim().length < 3) {
      toast.error(t("properties_form.title_required", "El título es requerido (mín. 3 caracteres)"));
      return;
    }
    if (form.price === undefined || form.price === null) {
      toast.error(t("properties_form.price_required", "El precio es requerido"));
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
        current?.id
          ? t("properties_form.updated_success", "Inmueble actualizado")
          : t("properties_form.created_success", "Inmueble creado ({{reference}})", { reference: saved.reference }),
      );
      if (current?.id) onClose(); // en edición: cerramos; en creación dejamos abierto para fotos
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("properties_form.save_error", "Error al guardar"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        current?.id
          ? t("properties_form.edit_title", "Editar {{reference}}", { reference: current.reference })
          : t("properties_form.new_title", "Nuevo inmueble")
      }
      subtitle={current?.id ? current.title : t("properties_form.register_subtitle", "Registra una propiedad")}
      icon={<Building2 className="w-5 h-5 text-white" />}
      size="xl"
      busy={saving}
      footer={
        <>
          <ModalButton variant="secondary" onClick={onClose} disabled={saving}>
            {current?.id ? t("properties_form.close", "Cerrar") : t("properties_form.cancel", "Cancelar")}
          </ModalButton>
          <ModalButton variant="primary" onClick={handleSubmit} loading={saving}>
            {current?.id ? t("properties_form.save_changes", "Guardar cambios") : t("properties_form.create_property", "Crear inmueble")}
          </ModalButton>
        </>
      }
    >
      <div className="space-y-6">
        {/* BÁSICO */}
        <Section title={t("properties_form.section_basic_info", "Información básica")}>
          <Field label={t("properties_form.field_title", "Título")} full>
            <Input
              value={form.title ?? ""}
              onChange={(e) => set({ title: e.target.value })}
              placeholder={form.kind ? KIND_TITLE_PLACEHOLDERS[form.kind] : t("properties_form.title_placeholder_default", "Título del inmueble")}
            />
          </Field>
          <Field label={t("properties_form.field_operation", "Tipo de negocio")}>
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
          <Field label={t("properties_form.field_kind", "Tipo de inmueble")}>
            <select
              className={selectCls}
              value={form.kind}
              onChange={(e) => handleKindChange(e.target.value)}
            >
              {Object.entries(KIND_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("properties_form.field_status", "Estado")}>
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
          {show("condition") && (
            <Field label={t("properties_form.field_condition", "Estado físico")}>
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
          )}
          <Field label={t("properties_form.field_description", "Descripción")} full>
            <textarea
              className={selectCls}
              rows={3}
              value={form.description ?? ""}
              onChange={(e) => set({ description: e.target.value })}
              placeholder={t("properties_form.description_placeholder", "Describe el inmueble, sus espacios y ventajas…")}
            />
          </Field>
        </Section>

        {/* PRECIO */}
        <Section title={t("properties_form.section_price", "Precio")}>
          <Field label={t("properties_form.field_price", "Precio (COP)")}>
            <Input
              type="number"
              value={form.price ?? ""}
              onChange={(e) => set({ price: num(e.target.value) })}
              placeholder="350000000"
            />
          </Field>
          <Field label={t("properties_form.field_admin_fee", "Administración mensual (COP)")}>
            <Input
              type="number"
              value={form.adminFee ?? ""}
              onChange={(e) => set({ adminFee: num(e.target.value) })}
              placeholder="450000"
            />
          </Field>
          <Field label={t("properties_form.field_commission", "Comisión (%)")}>
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
            {t("properties_form.negotiable_price", "Precio negociable")}
          </label>
        </Section>

        {/* ÁREAS Y DISTRIBUCIÓN — cada campo aparece solo si aplica al tipo (KIND_FIELDS) */}
        <Section title={form.kind === "LOTE" ? t("properties_form.section_lot_dimensions", "Dimensiones del lote") : t("properties_form.section_areas", "Áreas y distribución")}>
          {show("builtArea") && (
            <Field label={form.kind === "PARQUEADERO" ? t("properties_form.field_area_parking", "Área (m²)") : t("properties_form.field_built_area", "Área construida (m²)")}>
              <Input
                type="number"
                value={form.builtArea ?? ""}
                onChange={(e) => set({ builtArea: num(e.target.value) })}
              />
            </Field>
          )}
          {show("privateArea") && (
            <Field label={t("properties_form.field_private_area", "Área privada (m²)")}>
              <Input
                type="number"
                value={form.privateArea ?? ""}
                onChange={(e) => set({ privateArea: num(e.target.value) })}
              />
            </Field>
          )}
          {show("lotArea") && (
            <Field label={t("properties_form.field_lot_area", "Área del lote (m²)")}>
              <Input
                type="number"
                value={form.lotArea ?? ""}
                onChange={(e) => set({ lotArea: num(e.target.value) })}
              />
            </Field>
          )}
          {/* Frente/fondo del LOTE; en comerciales se capturan en "Datos comerciales" */}
          {show("frontage") && !isComercial && (
            <>
              <Field label={t("properties_form.field_frontage", "Frente (m)")}>
                <Input
                  type="number"
                  value={form.frontage ?? ""}
                  onChange={(e) => set({ frontage: num(e.target.value) })}
                />
              </Field>
              <Field label={t("properties_form.field_depth", "Fondo (m)")}>
                <Input
                  type="number"
                  value={form.depth ?? ""}
                  onChange={(e) => set({ depth: num(e.target.value) })}
                />
              </Field>
            </>
          )}
          {/* Uso del suelo del LOTE; en comerciales va en "Datos comerciales" */}
          {show("permittedUse") && !isComercial && (
            <Field label={t("properties_form.field_permitted_use", "Uso del suelo permitido (POT)")} full>
              <Input
                value={form.permittedUse ?? ""}
                onChange={(e) => set({ permittedUse: e.target.value })}
                placeholder={t("properties_form.permitted_use_placeholder_lot", "Residencial multifamiliar, comercial, industrial…")}
              />
            </Field>
          )}
          {show("bedrooms") && (
            <Field label={t("properties_form.field_bedrooms", "Habitaciones")}>
              <Input
                type="number"
                value={form.bedrooms ?? ""}
                onChange={(e) => set({ bedrooms: num(e.target.value) })}
              />
            </Field>
          )}
          {show("bathrooms") && (
            <Field label={t("properties_form.field_bathrooms", "Baños")}>
              <Input
                type="number"
                step="0.5"
                value={form.bathrooms ?? ""}
                onChange={(e) => set({ bathrooms: num(e.target.value) })}
              />
            </Field>
          )}
          {show("parkingSpots") && (
            <Field label={t("properties_form.field_parking_spots", "Parqueaderos")}>
              <Input
                type="number"
                value={form.parkingSpots ?? ""}
                onChange={(e) => set({ parkingSpots: num(e.target.value) })}
              />
            </Field>
          )}
          {show("stratum") && (
            <Field label={t("properties_form.field_stratum", "Estrato (1-6)")}>
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
          )}
          {show("floor") && (
            <Field label={t("properties_form.field_floor", "Piso / nivel")}>
              <Input
                type="number"
                value={form.floor ?? ""}
                onChange={(e) => set({ floor: num(e.target.value) })}
              />
            </Field>
          )}
          {show("totalFloors") && (
            <Field label={t("properties_form.field_total_floors", "Total de pisos")}>
              <Input
                type="number"
                value={form.totalFloors ?? ""}
                onChange={(e) => set({ totalFloors: num(e.target.value) })}
              />
            </Field>
          )}
          {show("yearBuilt") && (
            <Field label={t("properties_form.field_year_built", "Año de construcción")}>
              <Input
                type="number"
                value={form.yearBuilt ?? ""}
                onChange={(e) => set({ yearBuilt: num(e.target.value) })}
              />
            </Field>
          )}
        </Section>

        {/* DATOS COMERCIALES — solo locales, oficinas, bodegas, consultorios, edificios */}
        {isComercial && (
          <Section title={t("properties_form.section_commercial", "Datos comerciales")}>
            <Field label={t("properties_form.field_frontage", "Frente (m)")}>
              <Input
                type="number"
                value={form.frontage ?? ""}
                onChange={(e) => set({ frontage: num(e.target.value) })}
              />
            </Field>
            <Field label={t("properties_form.field_depth", "Fondo (m)")}>
              <Input
                type="number"
                value={form.depth ?? ""}
                onChange={(e) => set({ depth: num(e.target.value) })}
              />
            </Field>
            <Field label={t("properties_form.field_ceiling_height", "Altura libre (m)")}>
              <Input
                type="number"
                value={form.ceilingHeight ?? ""}
                onChange={(e) => set({ ceilingHeight: num(e.target.value) })}
              />
            </Field>
            <Field label={t("properties_form.field_power_type", "Acometida eléctrica")}>
              <select
                className={selectCls}
                value={form.powerType ?? ""}
                onChange={(e) => set({ powerType: (e.target.value || null) as never })}
              >
                <option value="">—</option>
                {Object.entries(POWER_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("properties_form.field_permitted_use", "Uso del suelo permitido (POT)")} full>
              <Input
                value={form.permittedUse ?? ""}
                onChange={(e) => set({ permittedUse: e.target.value })}
                placeholder={t("properties_form.permitted_use_placeholder_commercial", "Comercial, industria liviana, servicios…")}
              />
            </Field>
            <div className="sm:col-span-2 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.hasLoadingDock}
                  onChange={(e) => set({ hasLoadingDock: e.target.checked })}
                />
                {t("properties_form.loading_dock", "Muelle de carga")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.hasShowcase}
                  onChange={(e) => set({ hasShowcase: e.target.checked })}
                />
                {t("properties_form.showcase", "Vitrina a la calle")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.isCornerLot}
                  onChange={(e) => set({ isCornerLot: e.target.checked })}
                />
                {t("properties_form.corner_lot", "Esquinero")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.hasMezzanine}
                  onChange={(e) => set({ hasMezzanine: e.target.checked })}
                />
                {t("properties_form.mezzanine", "Entrepiso / mezzanine")}
              </label>
            </div>
          </Section>
        )}

        {/* UBICACIÓN */}
        <Section title={t("properties_form.section_location", "Ubicación")}>
          <Field label={t("properties_form.field_department", "Departamento")}>
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
          <Field label={t("properties_form.field_city", "Ciudad / Municipio")}>
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
          <Field label={t("properties_form.field_neighborhood", "Barrio / Zona")}>
            <Input
              value={form.neighborhood ?? ""}
              onChange={(e) => set({ neighborhood: e.target.value })}
            />
          </Field>
          <Field label={t("properties_form.field_address", "Dirección")}>
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
            {t("properties_form.show_exact_address", "Mostrar dirección exacta en la ficha pública")}
          </label>
        </Section>

        {/* LEGAL */}
        <Section title={t("properties_form.section_legal", "Legal y captación")}>
          <Field label={t("properties_form.field_registry_number", "Matrícula inmobiliaria")}>
            <Input
              value={form.registryNumber ?? ""}
              onChange={(e) => set({ registryNumber: e.target.value })}
              placeholder="50N-20123456"
            />
          </Field>
          <Field label={t("properties_form.field_cadastral_number", "Cédula catastral")}>
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
            {t("properties_form.exclusive_listing", "Captación exclusiva")}
          </label>
        </Section>

        {/* CARACTERÍSTICAS — sin sentido en activos sin espacios habitables (lote, parqueadero, otro) */}
        {catalog && showFeaturesSection && (
          <Section title={t("properties_form.section_features", "Características y amenidades")}>
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold text-gray-500 mb-1">{t("properties_form.features_of_property", "Del inmueble")}</p>
              <div className="flex flex-wrap gap-1.5">
                {featureOptions.map((f) => (
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
            <label className="flex items-center gap-2 text-sm sm:col-span-2 mt-2">
              <input
                type="checkbox"
                checked={!!form.isInComplex}
                onChange={(e) =>
                  set({
                    isInComplex: e.target.checked,
                    ...(!e.target.checked && { amenities: [] }),
                  })
                }
              />
              {t("properties_form.in_complex", "Está dentro de un conjunto cerrado o edificio con zonas comunes compartidas")}
            </label>
            {form.isInComplex && (
              <div className="sm:col-span-2 mt-2">
                <p className="text-xs font-semibold text-gray-500 mb-1">{t("properties_form.features_of_complex", "Del conjunto")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {amenityOptions.map((a) => (
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
            )}
          </Section>
        )}

        {/* PROPIETARIO */}
        <Section title={t("properties_form.section_owner_media", "Propietario y multimedia")}>
          <Field label={t("properties_form.field_owner_contact", "Propietario (contacto)")}>
            <select
              className={selectCls}
              value={form.ownerContactId ?? ""}
              onChange={(e) => set({ ownerContactId: e.target.value || null })}
            >
              <option value="">{t("properties_form.unassigned", "— Sin asignar —")}</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Oportunidad / Negocio (CRM)">
            <select
              className={selectCls}
              value={form.dealId ?? ""}
              onChange={(e) => set({ dealId: e.target.value || null })}
            >
              <option value="">{t("properties_form.unassigned", "— Sin asignar —")}</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("properties_form.field_video_url", "Video (URL)")}>
            <Input
              value={form.videoUrl ?? ""}
              onChange={(e) => set({ videoUrl: e.target.value || null })}
              placeholder="https://youtube.com/…"
            />
          </Field>
          <Field label={t("properties_form.field_virtual_tour_url", "Tour virtual (URL)")} full>
            <Input
              value={form.virtualTourUrl ?? ""}
              onChange={(e) => set({ virtualTourUrl: e.target.value || null })}
              placeholder="https://my.matterport.com/…"
            />
          </Field>
        </Section>

        {/* GALERÍA — solo tras crear */}
        <Section title={t("properties_form.section_gallery", "Galería de fotos")}>
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
              {t("properties_form.gallery_save_first", "Guarda el inmueble para habilitar la subida de fotos.")}
            </p>
          )}
        </Section>
      </div>
    </Modal>
  );
};
