import { z } from 'zod';
import { Logger } from './logger';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  META_VERIFY_TOKEN: z.string().min(1, 'META_VERIFY_TOKEN is required'),
  FRONTEND_URL: z.string().min(1, 'FRONTEND_URL is required'),
});

export const validateEnv = () => {
  try {
    envSchema.parse(process.env);
    Logger.info('[OK] Environment variables validated successfully.');
  } catch (error) {
    if (error instanceof z.ZodError) {
      Logger.error('[ERROR] Environment variables validation error:');
      error.errors.forEach((err) => {
        Logger.error(`- ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
  }
};