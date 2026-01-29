import rateLimit from "express-rate-limit";
import { Request, Response } from "express";
import { AuthenticatedRequest } from "@/types/types";

// Custom key generator for IP-based rate limiting
const getClientIp = (req: Request): string => {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    req.socket.remoteAddress ||
    "unknown"
  );
};

// Clave personalizada para identificar a los usuarios: por ID de usuario si está autenticado, o por IP si no.
// USAMOS UNA FUNCIÓN DEFENSIVA QUE YA NO DEPENDE DE ipKeyGenerator
const keyGenerator = (req: Request, res: Response): string => {
  // 1. Intentamos obtener el ID de usuario autenticado
  const userId = (req as AuthenticatedRequest).user?.id;

  if (userId) {
    return userId;
  }

  // 2. Fallback a IP
  return getClientIp(req);
};

/**
 * Limiter general para la mayoría de las rutas de la API.
 * 300 peticiones por minuto por usuario/IP.
 * Aumentado para soportar agentes manejando múltiples chats concurrentes.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  limit: 600, // Aumentado a 600 (10 req/sec) para empresas grandes
  keyGenerator: keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "fail",
    message: "Demasiadas peticiones, por favor intente de nuevo en un minuto.",
  },
});

/**
 * Limiter especial para Webhooks.
 * Debe soportar ráfagas altas de mensajes entrantes de WhatsApp/Meta.
 */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  limit: 3000, // 50 req/sec - Necesario para ráfagas de mensajes
  keyGenerator: getClientIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "error", message: "Webhook rate limit exceeded" },
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
  keyGenerator: getClientIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "fail",
    message:
      "Demasiados intentos de autenticación, por favor intente de nuevo en un minuto.",
  },
});
