import { z } from "zod";

/**
 * [REAL ESTATE] PROPERTY VALIDATION SCHEMAS
 *
 * Validación del módulo inmobiliario (mercado colombiano).
 */

/**
 * Trata "" como "campo no enviado" antes de aplicar el validador de formato.
 * Sin esto, un <input> opcional (URL, fecha, selector) que el usuario limpia
 * envía "" y rompe .url()/.datetime()/.cuid() con un error confuso.
 */
const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === "" ? undefined : val), schema);

const OPERATIONS = ["VENTA", "ARRIENDO", "ARRIENDO_VENTA", "PERMUTA"] as const;
const KINDS = [
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
] as const;
const STATUSES = [
  "DISPONIBLE",
  "RESERVADO",
  "ARRENDADO",
  "VENDIDO",
  "SUSPENDIDO",
  "BORRADOR",
] as const;
const CONDITIONS = [
  "NUEVO",
  "USADO",
  "SOBRE_PLANOS",
  "EN_CONSTRUCCION",
  "REMODELADO",
] as const;

// Campos compartidos entre create y update (sin required).
const propertyBody = {
  operation: z.enum(OPERATIONS),
  kind: z.enum(KINDS),
  status: z.enum(STATUSES).optional(),
  condition: z.enum(CONDITIONS).optional().nullable(),
  title: z.string().min(3, "El título es requerido (mín. 3 caracteres)."),
  description: z.string().max(5000).optional().nullable(),
  highlights: z.array(z.string()).optional(),
  price: z.number().min(0, "El precio no puede ser negativo."),
  currency: z.string().optional(),
  adminFee: z.number().min(0).optional().nullable(),
  priceIncludesAdmin: z.boolean().optional(),
  negotiable: z.boolean().optional(),
  builtArea: z.number().min(0).optional().nullable(),
  privateArea: z.number().min(0).optional().nullable(),
  lotArea: z.number().min(0).optional().nullable(),
  bedrooms: z.number().int().min(0).optional().nullable(),
  bathrooms: z.number().min(0).optional().nullable(),
  parkingSpots: z.number().int().min(0).optional().nullable(),
  floor: z.number().int().optional().nullable(),
  totalFloors: z.number().int().min(0).optional().nullable(),
  yearBuilt: z.number().int().min(1800).max(2100).optional().nullable(),
  stratum: z.number().int().min(1).max(6).optional().nullable(),
  department: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  neighborhood: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  addressVisible: z.boolean().optional(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  zipCode: z.string().optional().nullable(),
  registryNumber: z.string().optional().nullable(),
  cadastralNumber: z.string().optional().nullable(),
  isExclusive: z.boolean().optional(),
  capturedAt: emptyToUndefined(z.string().datetime().optional().nullable()),
  commissionPct: z.number().min(0).max(100).optional().nullable(),
  features: z.array(z.string()).optional(),
  amenities: z.array(z.string()).optional(),
  videoUrl: emptyToUndefined(
    z.string().url("Debe ser una URL válida.").optional().nullable(),
  ),
  virtualTourUrl: emptyToUndefined(
    z.string().url("Debe ser una URL válida.").optional().nullable(),
  ),
  ownerContactId: emptyToUndefined(
    z.string().cuid("Propietario no válido.").optional().nullable(),
  ),
  ownerAccountId: emptyToUndefined(
    z.string().cuid("Empresa propietaria no válida.").optional().nullable(),
  ),
  assignedToId: emptyToUndefined(
    z.string().cuid("Agente asignado no válido.").optional().nullable(),
  ),
  dealId: emptyToUndefined(
    z.string().cuid("Negociación no válida.").optional().nullable(),
  ),
};

export const CreatePropertySchema = z.object({
  body: z.object(propertyBody),
});

export const UpdatePropertySchema = z.object({
  params: z.object({ id: z.string().cuid("ID de inmueble no válido.") }),
  body: z
    .object({
      ...propertyBody,
      // En update todos son opcionales (incluidos los required del create).
      operation: z.enum(OPERATIONS).optional(),
      kind: z.enum(KINDS).optional(),
      title: z.string().min(3).optional(),
      price: z.number().min(0).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "Debe proporcionar al menos un campo para actualizar.",
    }),
});

export const PropertyIdParamSchema = z.object({
  params: z.object({ id: z.string().cuid("ID de inmueble no válido.") }),
});

export const PublishPropertySchema = z.object({
  params: z.object({ id: z.string().cuid("ID de inmueble no válido.") }),
  body: z.object({ isPublished: z.boolean() }),
});

export const ImageIdParamSchema = z.object({
  params: z.object({
    id: z.string().cuid("ID de inmueble no válido."),
    imageId: z.string().cuid("ID de imagen no válido."),
  }),
});

export const ReorderImagesSchema = z.object({
  params: z.object({ id: z.string().cuid("ID de inmueble no válido.") }),
  body: z.object({ orderedIds: z.array(z.string().cuid()).min(1) }),
});

export const SetCoverSchema = z.object({
  params: z.object({ id: z.string().cuid("ID de inmueble no válido.") }),
  body: z.object({ imageId: z.string().cuid("ID de imagen no válido.") }),
});

export const ListPropertiesSchema = z.object({
  query: z.object({
    operation: z.enum(OPERATIONS).optional(),
    kind: z.enum(KINDS).optional(),
    status: z.enum(STATUSES).optional(),
    city: z.string().optional(),
    neighborhood: z.string().optional(),
    stratum: z.coerce.number().int().min(1).max(6).optional(),
    priceMin: z.coerce.number().min(0).optional(),
    priceMax: z.coerce.number().min(0).optional(),
    areaMin: z.coerce.number().min(0).optional(),
    areaMax: z.coerce.number().min(0).optional(),
    bedroomsMin: z.coerce.number().int().min(0).optional(),
    bathroomsMin: z.coerce.number().min(0).optional(),
    q: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.enum(["newest", "oldest", "price_asc", "price_desc"]).optional(),
  }),
});

export const PublicPropertyParamSchema = z.object({
  params: z.object({ publicId: z.string().min(1) }),
});
