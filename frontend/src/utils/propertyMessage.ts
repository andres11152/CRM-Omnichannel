import type { Property, PropertyOperation, PropertyKind } from "@/types/property.types";
import { formatCOP } from "@/types/property.types";

/**
 * Etiquetas en español fijo para el mensaje de WhatsApp: el destinatario es un
 * cliente/lead colombiano, así que el contenido comercial no sigue el idioma
 * de la UI del agente (a diferencia de OPERATION_LABELS/KIND_LABELS de usePropertyLabels).
 */
const OPERATION_LABELS_ES: Record<PropertyOperation, string> = {
  VENTA: "Venta",
  ARRIENDO: "Arriendo",
  ARRIENDO_VENTA: "Arriendo o Venta",
  PERMUTA: "Permuta",
};

const KIND_LABELS_ES: Record<PropertyKind, string> = {
  APARTAMENTO: "Apartamento",
  CASA: "Casa",
  APARTAESTUDIO: "Apartaestudio",
  CASA_CAMPESTRE: "Casa campestre",
  LOCAL_COMERCIAL: "Local comercial",
  OFICINA: "Oficina",
  BODEGA: "Bodega",
  CONSULTORIO: "Consultorio",
  LOTE: "Lote",
  FINCA: "Finca",
  PARQUEADERO: "Parqueadero",
  HABITACION: "Habitación",
  EDIFICIO: "Edificio",
  OTRO: "Otro",
};

export const propertyPublicUrl = (publicId: string) => `${window.location.origin}/p/${publicId}`;

/** Arma el mensaje de WhatsApp con los datos clave del inmueble + enlace de la ficha pública. */
export const buildPropertyMessage = (property: Property): string => {
  // Basado en qué campos tiene datos, no en el grupo del kind — un LOTE
  // también tiene frente/fondo aunque no sea "comercial", por ejemplo.
  const specs: string[] = [];
  if (property.builtArea != null) specs.push(`${property.builtArea} m² construidos`);
  if (property.lotArea != null) specs.push(`${property.lotArea} m² de lote`);
  if (property.bedrooms != null) specs.push(`${property.bedrooms} hab.`);
  if (property.bathrooms != null) specs.push(`${property.bathrooms} baños`);
  if (property.frontage != null) specs.push(`Frente ${property.frontage} m`);
  if (property.depth != null) specs.push(`Fondo ${property.depth} m`);
  if (property.ceilingHeight != null) specs.push(`Altura ${property.ceilingHeight} m`);
  if (property.hasLoadingDock) specs.push("Muelle de carga");
  if (property.stratum != null) specs.push(`Estrato ${property.stratum}`);

  const location = [property.neighborhood, property.city].filter(Boolean).join(", ");

  const lines = [
    `*${property.title}*`,
    `${OPERATION_LABELS_ES[property.operation]} · ${KIND_LABELS_ES[property.kind]}`,
    `💰 ${formatCOP(property.price, property.currency)}${
      property.adminFee ? ` + ${formatCOP(property.adminFee)} admin.` : ""
    }`,
  ];
  if (specs.length) lines.push(`🏠 ${specs.join(" · ")}`);
  if (location) lines.push(`📍 ${location}`);

  // El enlace público solo es válido si el inmueble está publicado; de lo
  // contrario el destinatario recibiría un enlace roto (404).
  if (property.isPublished) {
    lines.push("", `Ver ficha completa: ${propertyPublicUrl(property.publicId)}`);
  }

  return lines.join("\n");
};

export { OPERATION_LABELS_ES, KIND_LABELS_ES };
