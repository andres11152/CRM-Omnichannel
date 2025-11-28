import { Request, Response, NextFunction } from 'express';
import * as z from 'zod';
import { AppError } from '@/utils/AppError';

export const validate =
  (schema: z.AnyZodObject) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Usamos .issues para obtener un array de todos los problemas de validación.
        // Esto es más robusto ya que captura todos los tipos de errores,
        // incluyendo los de campos anidados que .flatten() puede ofuscar.
        const errorMessages = error.issues.map((issue) => issue.message).join('. ');

        return next(new AppError(`Datos inválidos: ${errorMessages}`, 400));
      }
      return next(new AppError('Error interno durante la validación', 500));
    }
  };
