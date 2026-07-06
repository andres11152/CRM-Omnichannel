import { z } from "zod";

// ============================================================================
// EXTERNAL API SCHEMAS
// Strict Zod validation for all public API endpoints.
// ============================================================================

// --- PAGINATION ---
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// --- CONTACTS ---
export const createContactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(5, "Phone must be at least 5 characters").optional(),
  email: z.string().email("Invalid email").optional(),
  tags: z.array(z.string()).optional().default([]),
  notes: z.string().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreateContactInput = z.infer<typeof createContactSchema>;

export const updateContactSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(5).optional(),
  email: z.string().email().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

// --- MESSAGES ---
export const sendMessageSchema = z.object({
  to: z.string().min(5, "Recipient phone number is required"),
  text: z.string().min(1, "Message text is required"),
  sessionId: z.string().optional(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

// --- DEALS ---
export const createExternalDealSchema = z.object({
  title: z.string().min(1, "Title is required"),
  value: z.number().min(0).optional().default(0),
  currency: z.enum(["USD", "COP"]).optional().default("COP"),
  pipelineId: z.string().cuid("Invalid pipeline ID"),
  stageId: z.string().cuid("Invalid stage ID"),
  contactId: z.string().cuid().optional(),
  accountId: z.string().cuid().optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().datetime().optional(),
});
export type CreateExternalDealInput = z.infer<typeof createExternalDealSchema>;

// --- PROPERTIES (Real Estate) ---
export const createExternalPropertySchema = z.object({
  operation: z.enum(["VENTA", "ARRIENDO", "ARRIENDO_VENTA", "PERMUTA"]),
  kind: z.enum([
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
  ]),
  title: z.string().min(3, "Title is required"),
  price: z.number().min(0),
  description: z.string().optional(),
  city: z.string().optional(),
  neighborhood: z.string().optional(),
  stratum: z.number().int().min(1).max(6).optional(),
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().min(0).optional(),
  builtArea: z.number().min(0).optional(),
  lotArea: z.number().min(0).optional(),
  parkingSpots: z.number().int().min(0).optional(),
  frontage: z.number().min(0).optional(),
  depth: z.number().min(0).optional(),
  ceilingHeight: z.number().min(0).optional(),
  hasLoadingDock: z.boolean().optional(),
  hasShowcase: z.boolean().optional(),
  isCornerLot: z.boolean().optional(),
  hasMezzanine: z.boolean().optional(),
  powerType: z.enum(["MONOFASICA", "BIFASICA", "TRIFASICA"]).optional(),
  permittedUse: z.string().max(500).optional(),
  isInComplex: z.boolean().optional(),
});
export type CreateExternalPropertyInput = z.infer<typeof createExternalPropertySchema>;

export const externalPropertyQuerySchema = paginationQuerySchema.extend({
  operation: z.enum(["VENTA", "ARRIENDO", "ARRIENDO_VENTA", "PERMUTA"]).optional(),
  status: z
    .enum(["DISPONIBLE", "RESERVADO", "ARRENDADO", "VENDIDO", "SUSPENDIDO", "BORRADOR"])
    .optional(),
  city: z.string().optional(),
});
export type ExternalPropertyQuery = z.infer<typeof externalPropertyQuerySchema>;

// --- ID PARAMS ---
export const idParamSchema = z.object({
  id: z.string().cuid("Invalid ID format"),
});
export type IdParam = z.infer<typeof idParamSchema>;
