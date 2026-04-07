import { z } from 'zod';
import { Logger } from './logger';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es requerida'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET es requerido'),
  REDIS_URL: z.string().min(1, 'REDIS_URL es requerido'),
  META_VERIFY_TOKEN: z.string().min(1, 'META_VERIFY_TOKEN es requerido'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  FRONTEND_URL: z.string().min(1, 'FRONTEND_URL es requerido'),
});

export const validateEnv = () => {
  try {
    envSchema.parse(process.env);
    Logger.info('[OK] Variables de entorno validadas correctamente.');
  } catch (error) {
    if (error instanceof z.ZodError) {
      Logger.error('[ERROR] Error de validación en las variables de entorno:');
      error.errors.forEach((err) => {
        Logger.error(`- ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
  }
};