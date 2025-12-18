import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/prisma";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";

export interface TokenPayload {
  id: string;
  role: string;
  companyId?: string | null;
}

/**
 * Genera un token JWT firmado.
 * @param payload - El contenido del token (id, role, companyId).
 * @returns El token JWT.
 */
export const signToken = (payload: TokenPayload) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new AppError("JWT_SECRET no está definido en el archivo .env", 500);
  }
  // '7d' provee un excelente balance de UX (no loguearse diario)
  // manteniendo razonable seguridad (rota semanalmente).
  const expiresIn = "7d";
  const options: SignOptions = {
    expiresIn,
  };
  return jwt.sign({ ...payload }, jwtSecret, options);
};

export const signup = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { name, email, password, passwordConfirm, companyId } = req.body;

    if (!email || !password) {
      return next(
        new AppError("Por favor, proporcione email y contraseña", 400)
      );
    }

    // 1. Mejora: Verificar que las contraseñas coincidan
    if (password !== passwordConfirm) {
      return next(new AppError("Las contraseñas no coinciden", 400));
    }

    // 1) Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 12);

    // 2) Crear usuario
    const newUser = await (prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword, // Guardamos la contraseña encriptada
        companyId: companyId || undefined, // Allow linking to company if provided
        role: companyId ? "AGENT" : "ADMIN", // Default to AGENT if added to company, else ADMIN (new tenant)
      } as any,
    }) as Promise<any>);

    // 3) Firmar el token y enviarlo
    const token = signToken({
      id: newUser.id,
      role: newUser.role || "user", // Asumiendo que el modelo User tiene un campo 'role'
      companyId: newUser.companyId, // CORRECCIÓN: El campo es companyId (camelCase)
    });

    res.status(201).json({
      status: "success",
      token,
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          createdAt: newUser.createdAt,
          updatedAt: newUser.updatedAt,
        },
      },
    });
  }
);

export const login = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    // 1) Verificar que email y contraseña existen
    if (!email || !password) {
      return next(
        new AppError("Por favor, proporcione email y contraseña", 400)
      );
    }

    console.log(`[LOGIN DEBUG] Attempting login for email: ${email}`);

    // 2) Buscar al usuario y seleccionar explícitamente el campo 'password'
    console.log("[LOGIN DEBUG] Querying database for user...");
    const user = await (prisma.user.findUnique({
      where: { email },
      include: {
        company: {
          include: { plan: true },
        },
      },
    }) as Promise<any>);
    console.log(`[LOGIN DEBUG] User found: ${user ? "YES" : "NO"}`);

    // 3) Verificar si el usuario existe y la contraseña es correcta
    if (!user || !(await bcrypt.compare(password, user.password))) {
      console.log("[LOGIN DEBUG] Password mismatch or user not found");
      return next(new AppError("Email o contraseña incorrectos", 401));
    }

    // 4) Verificar estado de la empresa
    if (user.company) {
      // SOLO BLOQUEAMOS SI ESTÁ BANEADA.
      // INACTIVE, OVERDUE, CANCELED pueden entrar pero con restricciones (manejado en frontend/backend middleware)
      const restrictedStatuses = ["BANNED"];
      if (restrictedStatuses.includes(user.company.status)) {
        return next(
          new AppError(
            `Acceso denegado: Su cuenta está en estado ${user.company.status}. Contacte a soporte.`,
            403
          )
        );
      }
    }

    // 5) Si todo es correcto, enviar el token al cliente
    const token = signToken({
      id: user.id,
      role: user.role || "user",
      companyId: user.companyId,
      companyStatus: user.company?.status,
      planId: user.company?.planId,
    } as any);

    res.status(200).json({
      status: "success",
      token,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          company: user.company,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  }
);

export const updatePassword = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 1. Get user from collection
    const user = await prisma.user.findUnique({ where: { id: req.user?.id } });
    if (!user) return next(new AppError("User not found", 404));

    // 2. Check if current password is correct
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) {
      return next(
        new AppError("Por favor provee todos los campos requeridos.", 400)
      );
    }

    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return next(new AppError("Tu contraseña actual es incorrecta.", 401));
    }

    if (newPassword !== confirmPassword) {
      return next(
        new AppError("Las confirmación de contraseña no coincide.", 400)
      );
    }

    // 3. Update password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    // 4. Log user in, send JWT
    const token = signToken({
      id: user.id,
      role: user.role,
      companyId: user.companyId,
    });

    res.status(200).json({
      status: "success",
      token,
      message: "Contraseña actualizada correctamente.",
    });
  }
);
