import { z } from "zod";

/**
 * [PKG] PRODUCT VALIDATION SCHEMAS
 *
 * Validation for system-wide product catalog
 */

export const CreateProductSchema = z.object({
  body: z.object({
    name: z.string().min(1, "El nombre del producto es requerido."),
    sku: z.string().optional().nullable(),
    price: z.number().min(0, "El precio no puede ser negativo."),
    currency: z.string().optional().default("USD"),
    stock: z.number().int().min(0).optional().default(0),
    category: z.string().optional().default("General"),
    type: z.string().optional().default("Physical"),
    description: z.string().optional().nullable(),
    imageUrl: z.string().url("Debe ser una URL válida.").optional().nullable(),
    status: z.string().optional().default("active"),
  }),
});

export const UpdateProductSchema = z.object({
  params: z.object({
    id: z.string().cuid("ID de producto no válido."),
  }),
  body: z
    .object({
      name: z
        .string()
        .min(1, "El nombre del producto es requerido.")
        .optional(),
      sku: z.string().optional().nullable(),
      price: z.number().min(0, "El precio no puede ser negativo.").optional(),
      currency: z.string().optional(),
      stock: z.number().int().min(0).optional(),
      category: z.string().optional(),
      type: z.string().optional(),
      description: z.string().optional().nullable(),
      imageUrl: z
        .string()
        .url("Debe ser una URL válida.")
        .optional()
        .nullable(),
      status: z.string().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "Debe proporcionar al menos un campo para actualizar.",
    }),
});

export const ProductIdParamSchema = z.object({
  params: z.object({
    id: z.string().cuid("ID de producto no válido."),
  }),
});
