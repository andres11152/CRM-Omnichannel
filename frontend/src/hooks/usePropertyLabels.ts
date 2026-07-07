import { useTranslation } from "react-i18next";
import type {
  PropertyOperation,
  PropertyKind,
  PropertyStatus,
  PropertyCondition,
  PropertyPowerType,
} from "@/types/property.types";

/** Etiquetas traducibles del módulo de Propiedades (i18n `properties_labels`). */
export const usePropertyLabels = () => {
  const { t } = useTranslation();

  const OPERATION_LABELS: Record<PropertyOperation, string> = {
    VENTA: t("properties_labels.operation_venta", "Venta"),
    ARRIENDO: t("properties_labels.operation_arriendo", "Arriendo"),
    ARRIENDO_VENTA: t("properties_labels.operation_arriendo_venta", "Arriendo o Venta"),
    PERMUTA: t("properties_labels.operation_permuta", "Permuta"),
  };

  const KIND_LABELS: Record<PropertyKind, string> = {
    APARTAMENTO: t("properties_labels.kind_apartamento", "Apartamento"),
    CASA: t("properties_labels.kind_casa", "Casa"),
    APARTAESTUDIO: t("properties_labels.kind_apartaestudio", "Apartaestudio"),
    CASA_CAMPESTRE: t("properties_labels.kind_casa_campestre", "Casa campestre"),
    LOCAL_COMERCIAL: t("properties_labels.kind_local_comercial", "Local comercial"),
    OFICINA: t("properties_labels.kind_oficina", "Oficina"),
    BODEGA: t("properties_labels.kind_bodega", "Bodega"),
    CONSULTORIO: t("properties_labels.kind_consultorio", "Consultorio"),
    LOTE: t("properties_labels.kind_lote", "Lote"),
    FINCA: t("properties_labels.kind_finca", "Finca"),
    PARQUEADERO: t("properties_labels.kind_parqueadero", "Parqueadero"),
    HABITACION: t("properties_labels.kind_habitacion", "Habitación"),
    EDIFICIO: t("properties_labels.kind_edificio", "Edificio"),
    OTRO: t("properties_labels.kind_otro", "Otro"),
  };

  const STATUS_LABELS: Record<PropertyStatus, string> = {
    DISPONIBLE: t("properties_labels.status_disponible", "Disponible"),
    RESERVADO: t("properties_labels.status_reservado", "Reservado"),
    ARRENDADO: t("properties_labels.status_arrendado", "Arrendado"),
    VENDIDO: t("properties_labels.status_vendido", "Vendido"),
    SUSPENDIDO: t("properties_labels.status_suspendido", "Suspendido"),
    BORRADOR: t("properties_labels.status_borrador", "Borrador"),
  };

  const CONDITION_LABELS: Record<PropertyCondition, string> = {
    NUEVO: t("properties_labels.condition_nuevo", "Nuevo"),
    USADO: t("properties_labels.condition_usado", "Usado"),
    SOBRE_PLANOS: t("properties_labels.condition_sobre_planos", "Sobre planos"),
    EN_CONSTRUCCION: t("properties_labels.condition_en_construccion", "En construcción"),
    REMODELADO: t("properties_labels.condition_remodelado", "Remodelado"),
  };

  const POWER_TYPE_LABELS: Record<PropertyPowerType, string> = {
    MONOFASICA: t("properties_labels.power_type_monofasica", "Monofásica"),
    BIFASICA: t("properties_labels.power_type_bifasica", "Bifásica"),
    TRIFASICA: t("properties_labels.power_type_trifasica", "Trifásica"),
  };

  const KIND_TITLE_PLACEHOLDERS: Record<PropertyKind, string> = {
    APARTAMENTO: t("properties_labels.kind_title_placeholder_apartamento", "Apartamento amplio en Chapinero"),
    CASA: t("properties_labels.kind_title_placeholder_casa", "Casa de dos pisos en Cedritos"),
    APARTAESTUDIO: t("properties_labels.kind_title_placeholder_apartaestudio", "Apartaestudio moderno en Palermo"),
    CASA_CAMPESTRE: t("properties_labels.kind_title_placeholder_casa_campestre", "Casa campestre en Anapoima"),
    LOCAL_COMERCIAL: t("properties_labels.kind_title_placeholder_local_comercial", "Local comercial sobre vía principal"),
    OFICINA: t("properties_labels.kind_title_placeholder_oficina", "Oficina en el Centro Internacional"),
    BODEGA: t("properties_labels.kind_title_placeholder_bodega", "Bodega industrial en Fontibón"),
    CONSULTORIO: t("properties_labels.kind_title_placeholder_consultorio", "Consultorio en torre médica"),
    LOTE: t("properties_labels.kind_title_placeholder_lote", "Lote urbanizable en Rionegro"),
    FINCA: t("properties_labels.kind_title_placeholder_finca", "Finca productiva en el Quindío"),
    PARQUEADERO: t("properties_labels.kind_title_placeholder_parqueadero", "Parqueadero cubierto en Chapinero"),
    HABITACION: t("properties_labels.kind_title_placeholder_habitacion", "Habitación amoblada cerca a la universidad"),
    EDIFICIO: t("properties_labels.kind_title_placeholder_edificio", "Edificio rentable en El Poblado"),
    OTRO: t("properties_labels.kind_title_placeholder_otro", "Describe tu inmueble"),
  };

  return {
    OPERATION_LABELS,
    KIND_LABELS,
    STATUS_LABELS,
    CONDITION_LABELS,
    POWER_TYPE_LABELS,
    KIND_TITLE_PLACEHOLDERS,
  };
};
