/**
 * [REAL ESTATE] Tipos del módulo inmobiliario (espejo del backend).
 */

export type PropertyOperation = "VENTA" | "ARRIENDO" | "ARRIENDO_VENTA" | "PERMUTA";

export type PropertyKind =
  | "APARTAMENTO"
  | "CASA"
  | "APARTAESTUDIO"
  | "CASA_CAMPESTRE"
  | "LOCAL_COMERCIAL"
  | "OFICINA"
  | "BODEGA"
  | "CONSULTORIO"
  | "LOTE"
  | "FINCA"
  | "PARQUEADERO"
  | "HABITACION"
  | "EDIFICIO"
  | "OTRO";

export type PropertyStatus =
  | "DISPONIBLE"
  | "RESERVADO"
  | "ARRENDADO"
  | "VENDIDO"
  | "SUSPENDIDO"
  | "BORRADOR";

export type PropertyCondition =
  | "NUEVO"
  | "USADO"
  | "SOBRE_PLANOS"
  | "EN_CONSTRUCCION"
  | "REMODELADO";

export interface PropertyImage {
  id: string;
  url: string;
  key: string;
  order: number;
  isCover: boolean;
  width?: number | null;
  height?: number | null;
}

export interface PropertyOwnerRef {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
}

export interface Property {
  id: string;
  reference: string;
  slug: string;
  publicId: string;
  operation: PropertyOperation;
  kind: PropertyKind;
  status: PropertyStatus;
  condition?: PropertyCondition | null;
  title: string;
  description?: string | null;
  highlights: string[];
  price: number;
  currency: string;
  adminFee?: number | null;
  priceIncludesAdmin: boolean;
  negotiable: boolean;
  pricePerM2?: number | null;
  builtArea?: number | null;
  privateArea?: number | null;
  lotArea?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  parkingSpots?: number | null;
  floor?: number | null;
  totalFloors?: number | null;
  yearBuilt?: number | null;
  stratum?: number | null;
  country: string;
  department?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  address?: string | null;
  addressVisible: boolean;
  latitude?: number | null;
  longitude?: number | null;
  zipCode?: string | null;
  registryNumber?: string | null;
  cadastralNumber?: string | null;
  isExclusive: boolean;
  capturedAt?: string | null;
  commissionPct?: number | null;
  features: string[];
  amenities: string[];
  videoUrl?: string | null;
  virtualTourUrl?: string | null;
  ownerContactId?: string | null;
  ownerContact?: PropertyOwnerRef | null;
  ownerAccountId?: string | null;
  ownerAccount?: { id: string; name: string } | null;
  assignedToId?: string | null;
  assignedTo?: { id: string; name?: string | null; email?: string } | null;
  dealId?: string | null;
  isPublished: boolean;
  publishedAt?: string | null;
  viewsCount: number;
  images: PropertyImage[];
  createdAt: string;
  updatedAt: string;
}

export interface PropertyFilters {
  operation?: PropertyOperation;
  kind?: PropertyKind;
  status?: PropertyStatus;
  city?: string;
  neighborhood?: string;
  stratum?: number;
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  bedroomsMin?: number;
  bathroomsMin?: number;
  q?: string;
  page?: number;
  limit?: number;
  sort?: "newest" | "oldest" | "price_asc" | "price_desc";
}

export interface PropertyListResponse {
  items: Property[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PropertyCatalog {
  operations: PropertyOperation[];
  kinds: PropertyKind[];
  statuses: PropertyStatus[];
  conditions: PropertyCondition[];
  strata: number[];
  features: string[];
  amenities: string[];
  departments: string[];
  cities: Record<string, string[]>;
}

export type CreatePropertyPayload = Partial<Omit<Property, "id" | "images">> & {
  operation: PropertyOperation;
  kind: PropertyKind;
  title: string;
  price: number;
};

/** Etiquetas en español para la UI. */
export const OPERATION_LABELS: Record<PropertyOperation, string> = {
  VENTA: "Venta",
  ARRIENDO: "Arriendo",
  ARRIENDO_VENTA: "Arriendo o Venta",
  PERMUTA: "Permuta",
};

export const KIND_LABELS: Record<PropertyKind, string> = {
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

export const STATUS_LABELS: Record<PropertyStatus, string> = {
  DISPONIBLE: "Disponible",
  RESERVADO: "Reservado",
  ARRENDADO: "Arrendado",
  VENDIDO: "Vendido",
  SUSPENDIDO: "Suspendido",
  BORRADOR: "Borrador",
};

export const CONDITION_LABELS: Record<PropertyCondition, string> = {
  NUEVO: "Nuevo",
  USADO: "Usado",
  SOBRE_PLANOS: "Sobre planos",
  EN_CONSTRUCCION: "En construcción",
  REMODELADO: "Remodelado",
};

export const STATUS_COLORS: Record<PropertyStatus, string> = {
  DISPONIBLE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  RESERVADO: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  ARRENDADO: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  VENDIDO: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  SUSPENDIDO: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  BORRADOR: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

/** Formatea un precio en pesos colombianos (sin decimales). */
export const formatCOP = (value?: number | null, currency = "COP"): string => {
  if (value === null || value === undefined) return "—";
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${value.toLocaleString("es-CO")}`;
  }
};
