import { Request, Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/prisma";
import { AuthenticatedRequest } from "@/types/types";

/**
 * GET USERS CONTROLLER
 * Obtiene una lista de todos los usuarios de la base de datos.
 */
export const getUsers = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { role } = req.query;
    const companyId = req.companyId || req.user?.companyId;

    const where: any = {};

    // Filter by Company (Multi-tenancy)
    if (companyId) {
      where.companyId = companyId;
    }

    // Filter by Role if provided
    if (role) {
      where.role = role;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        companyId: true,
        createdAt: true,
        // Exclude password
      },
    });

    res.status(200).json({
      status: "success",
      results: users.length,
      data: { users },
    });
  }
);

/**
 * CREATE USER CONTROLLER (Admin only)
 * Crea un nuevo usuario vinculado a la compañía del admin.
 */
import bcrypt from "bcryptjs";

export const createUser = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { name, email, password, role } = req.body;
    const companyId = req.companyId;

    if (!companyId) {
      return next(
        new AppError("No se pudo determinar la compañía del usuario.", 400)
      );
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return next(new AppError("El email ya está registrado.", 400));
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        companyId,
        role: role || "AGENT",
      },
    });

    // Remove password from output
    const { password: _, ...userWithoutPassword } = newUser;

    res.status(201).json({
      status: "success",
      data: { user: userWithoutPassword },
    });
  }
);

/**
 * GET USER BY ID CONTROLLER
 * Obtiene un solo usuario por su ID.
 */
export const getUser = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return next(new AppError("No se encontró un usuario con ese ID", 404));
    }

    res.status(200).json({
      status: "success",
      data: { user },
    });
  }
);

/**
 * UPDATE USER CONTROLLER
 * Actualiza los datos de un usuario por su ID.
 */
export const updateUser = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { email, name } = req.body;

    // Un usuario solo puede editar su propio perfil (a menos que sea admin)
    const companyId = (req as any).companyId;

    // Permitir si es el mismo usuario
    const isSelf = id === req.user?.id;
    // Permitir si es ADMIN de la misma compañía y el objetivo es un AGENT
    let isAdminEditingAgent = false;

    if (req.user?.role === "ADMIN" && companyId && !isSelf) {
      const targetUser = await prisma.user.findUnique({ where: { id } });
      if (
        targetUser &&
        targetUser.companyId === companyId &&
        targetUser.role === "AGENT"
      ) {
        isAdminEditingAgent = true;
      }
    }

    if (!isSelf && !isAdminEditingAgent) {
      return next(
        new AppError("No tienes permiso para editar este perfil.", 403)
      );
    }

    // Prisma ignora los campos 'undefined', por lo que solo actualiza lo que se envía.
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        email,
        name,
      },
    });

    res.status(200).json({
      status: "success",
      data: { user: updatedUser },
    });
  }
);

/**
 * DELETE USER CONTROLLER
 * Elimina un usuario por su ID.
 */
export const deleteUser = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;

    // Lógica de negocio: Permitir a ADMIN eliminar AGENT de su misma compañía
    const companyId = (req as any).companyId;
    if (req.user?.role === "ADMIN" && companyId) {
      const targetUser = await prisma.user.findUnique({ where: { id } });

      if (!targetUser) {
        return next(new AppError("Usuario no encontrado", 404));
      }

      if (targetUser.companyId !== companyId) {
        return next(
          new AppError(
            "No tienes permiso para eliminar usuarios de otra compañía.",
            403
          )
        );
      }

      // Opcional: Impedir eliminar otros ADMINs
      if (targetUser.role !== "AGENT") {
        return next(
          new AppError("Solo puedes eliminar cuentas de Agentes.", 403)
        );
      }

      await prisma.user.delete({ where: { id } });
      return res.status(204).send();
    }

    // Fallback para otros casos (o si el usuario intenta borrarse a sí mismo, que también podríamos permitir)
    if (id !== req.user?.id) {
      return next(
        new AppError("No tienes permiso para eliminar usuarios.", 403)
      );
    }

    // Auto-eliminación (si se desea permitir)
    await prisma.user.delete({ where: { id } });
    res.status(204).send();
  }
);
