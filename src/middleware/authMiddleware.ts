import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/prisma";
import { AuthenticatedRequest } from "@/types/types";

export const protect = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 0) API Key Authentication (for external systems)
    if (req.headers["x-api-key"]) {
      const apiKey = req.headers["x-api-key"] as string;
      // Import crypto dynamically or ensure it's imported at top
      const crypto = require("crypto");
      const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

      const storedKey = await prisma.apiKey.findUnique({
        where: { keyHash },
      });

      if (!storedKey) {
        return next(new AppError("Invalid API Key", 401));
      }

      // Update last used (async, don't await to not block)
      prisma.apiKey
        .update({
          where: { id: storedKey.id },
          data: { lastUsedAt: new Date() },
        })
        .catch(console.error);

      req.companyId = storedKey.companyId;
      req.user = {
        id: "api-system",
        role: "ADMIN",
        email: "system@api",
        name: storedKey.name,
        companyId: storedKey.companyId,
      };
      return next();
    }

    // 1) Bearer Token Authentication (for frontend users)
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return next(
        new AppError(
          "No has iniciado sesión. Por favor, inicia sesión para obtener acceso.",
          401
        )
      );
    }

    // 2) Verificar el token
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
      console.log("[Auth] Token decoded:", decoded);
    } catch (error) {
      console.error("[Auth] Token verification failed:", error);
      return next(new AppError("Token inválido o expirado", 401));
    }

    // 3) Verificar si el usuario aún existe
    console.log("[Auth] Verifying user existence for ID:", decoded.id);
    if (!prisma) {
      console.error("[Auth] CRITICAL: Prisma client is undefined!");
      return next(new AppError("Database connection error", 500));
    }
    const currentUser = await prisma.user.findUnique({
      where: { id: decoded.id },
    });
    if (!currentUser) {
      console.error(`[Auth] User not found for ID: ${decoded.id}`);
      return next(
        new AppError("El usuario perteneciente a este token ya no existe.", 401)
      );
    }

    // GARANTIZAR ACCESO A LA RUTA PROTEGIDA
    // Adjuntamos la información del token y la compañía a la petición
    req.user = {
      id: decoded.id,
      role: decoded.role,
      email: currentUser.email,
      name: currentUser.name,
      companyId: decoded.companyId, // Fix: Attach companyId to user object
    };
    req.companyId = decoded.companyId; // Adjuntamos el companyId directamente a la request
    next();
  }
);
