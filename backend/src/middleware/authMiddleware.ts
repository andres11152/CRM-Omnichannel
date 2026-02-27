import { Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/database";
import { AuthenticatedRequest } from "@/types/types";
// 🛡️ SECURITY: Use TenantContextManager for Row-Level Security
import TenantContextManager from "@/config/tenantContext";
import redisClient from "@/config/redis";
import { Logger } from "@/utils/logger";

export const protect = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 0) API Key Authentication (for external systems)
    if (req.headers["x-api-key"]) {
      const apiKey = req.headers["x-api-key"] as string;
      // Import crypto dynamically
      const crypto = await import("crypto");
      const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

      const storedKey = await prisma.apiKey.findUnique({
        where: { keyHash },
      });

      if (!storedKey) {
        return next(new AppError("Invalid API Key", 401));
      }

      // Update last used (async, don't await)
      prisma.apiKey
        .update({
          where: { id: storedKey.id },
          data: { lastUsedAt: new Date() },
        })
        .catch((err) => Logger.error("Failed to update API key", err));

      req.companyId = storedKey.companyId;
      req.user = {
        id: "api-system",
        role: "ADMIN",
        email: "system@api",
        name: storedKey.name,
        companyId: storedKey.companyId,
      };

      // 🛡️ SET TENANT CONTEXT FOR API KEY (Critical for RLS)
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

    // 1) Bearer Token Authentication (for frontend users)
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    // Uncomment for detailed auth debugging
    /*
    Logger.debug(`[AuthDebug] Method: ${req.method} Url: ${req.originalUrl}`);
    Logger.debug(`[AuthDebug] Token found: ${token ? "Yes" : "No"}`);
    */

    if (!token) {
      return next(
        new AppError(
          "No has iniciado sesión. Por favor, inicia sesión para obtener acceso.",
          401,
        ),
      );
    }

    // 2) Verificar el token
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    } catch (error) {
      Logger.error("[Auth] Token verification failed:", error as Error);
      return next(new AppError("Token inválido o expirado", 401));
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
      if (!prisma) {
        Logger.error("[Auth] CRITICAL: Prisma client is undefined!");
        return next(new AppError("Database connection error", 500));
      }

      try {
        currentUser = await prisma.user.findUnique({
          where: { id: decoded.id },
        });

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

    // 4) GRANT ACCESS

    // Attach user info to request
    // 100-Year Fix: Include ALL user profile fields so /me returns complete data
    req.user = {
      id: decoded.id,
      role: decoded.role,
      email: currentUser.email,
      name: currentUser.name,
      // Fallback: If companyId is not in token (legacy tokens), use user's companyId from DB
      companyId: decoded.companyId || currentUser.companyId,
      preferences: currentUser.preferences,
      // Profile fields - CRITICAL for profile page persistence
      profilePicUrl: currentUser.profilePicUrl,
      phone: currentUser.phone,
      about: currentUser.about,
    };
    req.companyId = req.user.companyId;

    // 🛡️ SET TENANT CONTEXT FOR JWT USER (Critical for RLS)
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
        `[Auth] 🚨 SECURITY: User ${req.user.id} has no companyId! Blocking request to prevent data leak.`,
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
