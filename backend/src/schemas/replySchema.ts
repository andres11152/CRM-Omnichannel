import { z } from 'zod';

/**
 * [SEC] REPLY VALIDATION SCHEMAS
 * 
 * Validates comments/replies on posts.
 */

export const CreateReplySchema = z.object({
  body: z.object({
    content: z.string({
      required_error: 'El contenido de la respuesta es requerido.',
    }).min(1, 'El contenido no puede estar vacío.'),
    postId: z.string({
      required_error: 'El ID del post es requerido.',
    }).min(1, 'El ID del post no puede estar vacío.'),
  }),
});
