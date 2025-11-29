import { Request, Response, NextFunction } from "express";
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
  const expiresIn = "7d";
  const options: SignOptions = {
    expiresIn,
  };
  return jwt.sign({ ...payload }, jwtSecret, options);
};

export const signup = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { name, email, password, passwordConfirm } = req.body;

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
    }) as Promise<any>);
    console.log(`[LOGIN DEBUG] User found: ${user ? "YES" : "NO"}`);

    // 3) Verificar si el usuario existe y la contraseña es correcta
    if (!user || !(await bcrypt.compare(password, user.password))) {
      console.log("[LOGIN DEBUG] Password mismatch or user not found");
      return next(new AppError("Email o contraseña incorrectos", 401));
    }

    // 4) Si todo es correcto, enviar el token al cliente
    const token = signToken({
      id: user.id,
      role: user.role || "user",
      companyId: user.companyId,
    });

    res.status(200).json({
      status: "success",
      token,
    });
  }
);
