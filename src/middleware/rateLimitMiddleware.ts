import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '@/types/types';

// Clave personalizada para identificar a los usuarios: por ID de usuario si está autenticado, o por IP si no.
// USAMOS UNA FUNCIÓN DEFENSIVA QUE YA NO DEPENDE DE ipKeyGenerator
const keyGenerator = (req: Request, res: Response): string => {
    
    // 1. Intentamos obtener el ID de usuario autenticado usando el tipo correcto
    const userId = (req as AuthenticatedRequest).user?.id; 

    if (userId) {
        return userId;
    }
    
    // 2. Fallback Seguro: Usamos la propiedad .ip nativa de Express.
    // Esto evita el conflicto de tipos que causaba ipKeyGenerator().
    // Usamos 'anonymous' como fallback si el IP no se puede resolver.
    return req.ip || 'anonymous';
}; 

/**
 * Limiter general para la mayoría de las rutas de la API.
 * 100 peticiones por minuto por usuario/IP.
 */
export const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 100,
    keyGenerator: keyGenerator, // Usamos la función corregida
    standardHeaders: true, 
    legacyHeaders: false, 
    message: {
        status: 'fail',
        message: 'Demasiadas peticiones, por favor intente de nuevo en un minuto.',
    },
});

/**
 * Limiter más estricto para rutas sensibles como login, registro o recuperación de contraseña.
 * Previene ataques de fuerza bruta. 10 peticiones por minuto por IP.
 */
export const authLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 10,
    // Para endpoints públicos, nos basamos en la IP.
    // Envolvemos `ipKeyGenerator` en una función anónima para resolver la
    // incompatibilidad de tipos que detecta TypeScript, y al mismo tiempo
    // cumplimos con la recomendación de seguridad de la librería.
    // Usamos `as any` para forzar la compatibilidad de tipos, resolviendo el conflicto
    // entre el `req` de rate-limit y el que espera `ipKeyGenerator`.
    keyGenerator: (req: Request) => ipKeyGenerator(req as any),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 'fail',
        message: 'Demasiados intentos de autenticación, por favor intente de nuevo en un minuto.',
    },
});