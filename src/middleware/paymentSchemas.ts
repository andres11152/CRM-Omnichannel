import { z } from 'zod';

export const createCheckoutSessionSchema = z.object({
  body: z.object({
    priceId: z.string({
      required_error: 'El ID del precio (priceId) es requerido.'
    }).min(1, 'El ID del precio (priceId) no puede estar vacío.'),
  }),
});