import { Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
// [SEC] SECURITY: Use Repositories for Layered Isolation
import { userRepository } from "@/repositories/UserRepository";
import { apiKeyRepository } from "@/repositories/ApiKeyRepository";
import TenantContextManager from "@/config/tenantContext";
import redisClient from "@/config/redis";
import { Logger } from "@/utils/logger";
import { sessionService } from "@/services/SessionService";

export const protect = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 0) API Key Authentication (for external systems)
    if (req.headers["x-api-key"]) {
      const apiKey = req.headers["x-api-key"] as string;
      // Import crypto dynamically
      const crypto = await import("crypto");
      const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

      const storedKey = await apiKeyRepository.findUnique({
        where: { keyHash },
      });

      if (!storedKey) {
        return next(new AppError("Invalid API Key", 401));
      }

      // Update last used (async, don't await) - Now via repository
      apiKeyRepository
        .update({
          where: { id: storedKey.id },
          data: { lastUsedAt: new Date() },
        })
        .catch((err) => Logger.error("Failed to update API key", err));

      // Enforce immutability for API Key sessions
      Object.defineProperty(req, "companyId", {
        value: storedKey.companyId,
        writable: false,
        configurable: false,
        enumerable: true,
      });

      Object.defineProperty(req, "user", {
        value: {
          id: "api-system",
          role: "ADMIN",
          email: "system@api",
          name: storedKey.name,
          companyId: storedKey.companyId,
        },
        writable: false,
        configurable: false,
        enumerable: true,
      });

      // [SEC] SET TENANT CONTEXT FOR API KEY (Critical for RLS)
      // Wrap the next() call in the tenant context
      return TenantContextManager.run(
        {
          companyId: storedKey.companyId,
          userId: "api-system",
          requestId: req.headers["x-request-id"] as string,
        },
        () => next(),
      );
    }

    // 1) Extract Bearer Token (Cookie > Header) — Enterprise Priority
    let token;

    // A. Try HttpOnly cookie first (most secure, XSS-proof)
    if (req.cookies?.access_token) {
      token = req.cookies.access_token;
    }
    // B. Fallback to Authorization header (mobile apps, Postman, legacy)
    else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return next(
        new AppError(
          "No has iniciado sesión. Por favor, inicia sesión para obtener acceso.",
          401,
        ),
      );
    }

    // 2) Verificar el token
    const { getEnv } = await import("@/config/env");
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, getEnv().JWT_SECRET) as JwtPayload;
    } catch (error) {
      Logger.error("[Auth] Token verification failed:", error as Error);
      return next(new AppError("Token inválido o expirado", 401));
    }

    // 2b) [SEC] ENTERPRISE: Check if token is blacklisted (instant revocation)
    if (decoded.jti) {
      const isBlacklisted = await sessionService.isTokenBlacklisted(
        decoded.jti,
      );
      if (isBlacklisted) {
        return next(
          new AppError(
            "Sesión revocada. Por favor inicia sesión nuevamente.",
            401,
          ),
        );
      }
    }

    // 3) Verificar si el usuario aún existe (Optimizado con Redis Cache)
    let currentUser;
    const cacheKey = `auth:user:${decoded.id}`;

    // A. Intentar leer de Redis (Cache-Aside)
    if (redisClient?.isOpen) {
      try {
        const cachedUser = await redisClient.get(cacheKey);
        if (cachedUser) {
          currentUser = JSON.parse(cachedUser);
        }
      } catch {
        // Fallback silencioso a DB si Redis falla
        Logger.warn("[Auth] Redis lookup failed, falling back to DB");
      }
    }

    // B. Si no está en caché, consultar DB (Cache Miss)
    if (!currentUser) {
      try {
        // [SEC] SECURITY BYPASS: Use system context for Initial Authentication
        // RLS prevents reading Users without a tenant; we must use system mode to identify the user first.
        currentUser = await TenantContextManager.run({ companyId: "__SYSTEM__", userId: "auth-system" }, () => 
          userRepository.findUnique({
            where: { id: decoded.id },
          })
        );

        // C. Guardar en Redis (TTL: 5 minutos / 300s)
        if (currentUser && redisClient?.isOpen) {
          try {
            await redisClient.set(cacheKey, JSON.stringify(currentUser), {
              EX: 300,
            });
          } catch {
            Logger.warn("[Auth] Failed to cache user in Redis");
          }
        }
      } catch (dbError) {
        Logger.error("[Auth] DB Connection Failed:", dbError as Error);
        return next(
          new AppError(
            "Error de conexión con base de datos. Intente más tarde.",
            503,
          ),
        );
      }
    }

    if (!currentUser) {
      // Emergency check for debug
      return next(
        new AppError(
          "El usuario perteneciente a este token ya no existe.",
          401,
        ),
      );
    }

    // [SEC] GRANT ACCESS & ENFORCE IMMUTABILITY
    // Attach user info to request
    const userContext = {
      id: decoded.id,
      role: decoded.role,
      email: currentUser.email,
      name: currentUser.name,
      companyId: (decoded.companyId || currentUser.companyId) as string,
      preferences: (currentUser.preferences as Record<string, unknown>) || {},
      profilePicUrl: currentUser.profilePicUrl || "",
      phone: currentUser.phone || "",
      about: currentUser.about || "",
    };

    // Use Object.defineProperty to make companyId immutable for the rest of the request
    // Set configurable: true to avoid crashes if middleware is executed twice for the same request
    try {
      const companyIdDescriptor = Object.getOwnPropertyDescriptor(req, "companyId");
      if (!companyIdDescriptor || companyIdDescriptor.configurable) {
        Object.defineProperty(req, "companyId", {
          value: userContext.companyId,
          writable: false,
          configurable: true,
          enumerable: true,
        });
      }

      const userDescriptor = Object.getOwnPropertyDescriptor(req, "user");
      if (!userDescriptor || userDescriptor.configurable) {
        Object.defineProperty(req, "user", {
          value: userContext,
          writable: false,
          configurable: true,
          enumerable: true,
        });
      }
    } catch (propertyError) {
      // Fallback assign if defineProperty fails due to environment restrictions
      // Using type casting to AuthenticatedRequest instead of any
      const authReq = req as AuthenticatedRequest;
      (authReq as { companyId: string }).companyId = userContext.companyId;
      (authReq as { user: typeof userContext }).user = userContext;
      
      Logger.warn("[Auth] Property definition fallback triggered", { 
        userId: decoded.id,
        error: propertyError instanceof Error ? propertyError.message : String(propertyError)
      });
    }

    //  Attach JTI and sessionId for logout/revocation support
    (req as AuthenticatedRequest & { jti?: string; sessionId?: string }).jti =
      decoded.jti;
    (
      req as AuthenticatedRequest & { jti?: string; sessionId?: string }
    ).sessionId = decoded.sessionId;

    // [SEC] SET TENANT CONTEXT FOR JWT USER (Critical for RLS)
    // This activates Row-Level Security for the entire request lifecycle
    if (req.user.companyId) {
      // Wrap next() in tenant context to ensure all downstream queries are scoped
      return TenantContextManager.run(
        {
          companyId: req.user.companyId,
          userId: req.user.id,
          requestId: req.headers["x-request-id"] as string,
        },
        () => next(),
      );
    } else {
      // If system user (super admin) or broken state
      Logger.error(
        `[Auth] [ALERT] SECURITY: User ${req.user.id} has no companyId! Blocking request to prevent data leak.`,
      );
      return next(
        new AppError(
          "User configuration error: missing company affiliation",
          403,
        ),
      );
    }
  },
);
