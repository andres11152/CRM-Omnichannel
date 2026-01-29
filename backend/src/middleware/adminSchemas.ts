import { z } from 'zod';
import { CompanyStatus } from '@prisma/client';

export const updateCompanyStatusSchema = z.object({
  body: z.object({
    // 1. Validamos que el status sea uno de los valores del enum de Prisma.
    status: z
      .nativeEnum(CompanyStatus, { // El segundo argumento es para el mensaje de error
        // Con la versión correcta de Zod (v3), esta es la sintaxis recomendada.
        invalid_type_error: "El estado (status) proporcionado no es válido.",
      }),
  }),
  params: z.object({
    companyId: z.string().min(1, 'El ID de la compañía es requerido.'),
  }),
});

export const createCompanySchema = z.object({
  body: z.object({
    name: z.string({
      required_error: 'El nombre de la compañía es requerido.',
    }).min(1, 'El nombre de la compañía no puede estar vacío.'),
    // Añade aquí otros campos requeridos para crear una compañía, ej: email, etc.
  }),
});

export const savePlanSchema = z.object({
  body: z.object({
    id: z.string({ required_error: 'El ID del plan es requerido.' }).min(1, 'El ID del plan no puede estar vacío.'),
    name: z.string({ required_error: 'El nombre del plan es requerido.' }).min(1, 'El nombre del plan no puede estar vacío.'),
    price: z.number({ required_error: 'El precio es requerido.' }).min(0, 'El precio no puede ser negativo.'),
    config: z.record(z.any(), {
      required_error: 'La configuración (config) es requerida.',
      invalid_type_error: 'La configuración (config) debe ser un objeto JSON.',
    }),
  }),
});