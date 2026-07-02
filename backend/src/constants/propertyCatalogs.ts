/**
 * [REAL ESTATE] CATÁLOGOS DEL MÓDULO DE PROPIEDADES — Mercado Colombiano
 *
 * Fuente única para validar arrays (features/amenities) y alimentar el
 * frontend vía GET /api/properties/catalog. Extensible sin migración de BD
 * (los campos se almacenan como String[] en Postgres).
 */

/** Características del inmueble (interiores). */
export const PROPERTY_FEATURES = [
  "Closets",
  "Cocina integral",
  "Cocina abierta",
  "Balcón",
  "Terraza",
  "Patio",
  "Chimenea",
  "Estudio",
  "Cuarto de servicio",
  "Baño de servicio",
  "Depósito / Bodega",
  "Vestier",
  "Gas natural",
  "Calentador",
  "Aire acondicionado",
  "Pisos en madera",
  "Pisos en porcelanato",
  "Cocina con isla",
  "Zona de ropas",
  "Jacuzzi",
  "Amoblado",
  "Vista exterior",
  "Vista panorámica",
  "Duplex",
  "Penthouse",
] as const;

/** Amenidades del conjunto / edificio. */
export const PROPERTY_AMENITIES = [
  "Portería 24 horas",
  "Vigilancia privada",
  "Circuito cerrado de TV",
  "Ascensor",
  "Piscina",
  "Piscina para niños",
  "Gimnasio",
  "Salón comunal",
  "Salón de juegos",
  "Zona BBQ",
  "Juegos infantiles",
  "Parqueadero de visitantes",
  "Zonas verdes",
  "Cancha múltiple",
  "Cancha de squash",
  "Turco / Sauna",
  "Sendero peatonal",
  "Coworking",
  "Zona de mascotas",
  "Planta eléctrica",
  "Shut de basuras",
] as const;

/**
 * Departamentos de Colombia (32 + Bogotá D.C.).
 * Para autocompletar y validar ubicación.
 */
export const CO_DEPARTMENTS = [
  "Amazonas",
  "Antioquia",
  "Arauca",
  "Atlántico",
  "Bogotá D.C.",
  "Bolívar",
  "Boyacá",
  "Caldas",
  "Caquetá",
  "Casanare",
  "Cauca",
  "Cesar",
  "Chocó",
  "Córdoba",
  "Cundinamarca",
  "Guainía",
  "Guaviare",
  "Huila",
  "La Guajira",
  "Magdalena",
  "Meta",
  "Nariño",
  "Norte de Santander",
  "Putumayo",
  "Quindío",
  "Risaralda",
  "San Andrés y Providencia",
  "Santander",
  "Sucre",
  "Tolima",
  "Valle del Cauca",
  "Vaupés",
  "Vichada",
] as const;

/**
 * Principales ciudades por departamento (semilla para autocompletar).
 * No pretende ser exhaustivo; el campo `city` acepta texto libre.
 */
export const CO_MAIN_CITIES: Record<string, string[]> = {
  "Bogotá D.C.": ["Bogotá"],
  Antioquia: ["Medellín", "Envigado", "Bello", "Itagüí", "Sabaneta", "Rionegro", "La Estrella"],
  "Valle del Cauca": ["Cali", "Palmira", "Buenaventura", "Jamundí", "Yumbo", "Tuluá"],
  Atlántico: ["Barranquilla", "Soledad", "Puerto Colombia", "Malambo"],
  Cundinamarca: ["Soacha", "Chía", "Zipaquirá", "Facatativá", "Cajicá", "Mosquera", "Madrid", "Funza"],
  Santander: ["Bucaramanga", "Floridablanca", "Girón", "Piedecuesta"],
  Bolívar: ["Cartagena", "Magangué", "Turbaco"],
  "Norte de Santander": ["Cúcuta", "Villa del Rosario", "Los Patios"],
  Risaralda: ["Pereira", "Dosquebradas", "Santa Rosa de Cabal"],
  Caldas: ["Manizales", "Villamaría", "Chinchiná"],
  Quindío: ["Armenia", "Calarcá", "Montenegro"],
  Tolima: ["Ibagué", "Espinal", "Melgar"],
  Huila: ["Neiva", "Pitalito"],
  Meta: ["Villavicencio", "Acacías"],
  Córdoba: ["Montería", "Cereté"],
  Magdalena: ["Santa Marta", "Ciénaga"],
  Cesar: ["Valledupar", "Aguachica"],
  Nariño: ["Pasto", "Ipiales", "Tumaco"],
  Cauca: ["Popayán", "Santander de Quilichao"],
  Boyacá: ["Tunja", "Duitama", "Sogamoso"],
};

export type PropertyFeature = (typeof PROPERTY_FEATURES)[number];
export type PropertyAmenity = (typeof PROPERTY_AMENITIES)[number];

/** Sets O(1) para validación en el service/schema. */
export const VALID_FEATURES: ReadonlySet<string> = new Set(PROPERTY_FEATURES);
export const VALID_AMENITIES: ReadonlySet<string> = new Set(PROPERTY_AMENITIES);

/** Payload que consume el frontend para armar selects/filtros. */
export const PROPERTY_CATALOG = {
  operations: ["VENTA", "ARRIENDO", "ARRIENDO_VENTA", "PERMUTA"],
  kinds: [
    "APARTAMENTO",
    "CASA",
    "APARTAESTUDIO",
    "CASA_CAMPESTRE",
    "LOCAL_COMERCIAL",
    "OFICINA",
    "BODEGA",
    "CONSULTORIO",
    "LOTE",
    "FINCA",
    "PARQUEADERO",
    "HABITACION",
    "EDIFICIO",
    "OTRO",
  ],
  statuses: ["DISPONIBLE", "RESERVADO", "ARRENDADO", "VENDIDO", "SUSPENDIDO", "BORRADOR"],
  conditions: ["NUEVO", "USADO", "SOBRE_PLANOS", "EN_CONSTRUCCION", "REMODELADO"],
  strata: [1, 2, 3, 4, 5, 6],
  features: PROPERTY_FEATURES,
  amenities: PROPERTY_AMENITIES,
  departments: CO_DEPARTMENTS,
  cities: CO_MAIN_CITIES,
} as const;
