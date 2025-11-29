import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/prisma";
import { AuthenticatedRequest } from "@/types/types";

export const protect = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 1) Obtener el token y verificar si existe
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
    } catch (error) {
      return next(new AppError("Token inválido o expirado", 401));
    }

    // 3) Verificar si el usuario aún existe
    const currentUser = await prisma.user.findUnique({
      where: { id: decoded.id },
    });
    if (!currentUser) {
      return next(
        new AppError("El usuario perteneciente a este token ya no existe.", 401)
      );
    }

    // GARANTIZAR ACCESO A LA RUTA PROTEGIDA
    // Adjuntamos la información del token y la compañía a la petición
    req.user = { id: decoded.id, role: decoded.role, email: currentUser.email }; // Agregamos el email del usuario actual
    req.companyId = decoded.companyId; // Adjuntamos el companyId directamente a la request
    next();
  }
);
