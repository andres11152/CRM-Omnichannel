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
  async (req: Request, res: Response, next: NextFunction) => {
    const users = await prisma.user.findMany();

    res.status(200).json({
      status: "success",
      results: users.length,
      data: { users },
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

    // Un usuario solo puede editar su propio perfil (a menos que sea admin, lógica a añadir después)
    if (id !== req.user?.id) {
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

    // Lógica de negocio: Por ahora, nadie puede eliminar usuarios a través de la API.
    // Un super admin podría, pero esa lógica iría en un controlador de admin.
    if (id !== req.user?.id) {
      return next(
        new AppError("No tienes permiso para eliminar usuarios.", 403)
      );
    }
    return next(
      new AppError(
        "La eliminación de usuarios no está permitida a través de esta ruta.",
        403
      )
    );

    // Primero, verificamos si el usuario existe para dar un error 404 claro si no se encuentra.
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return next(
        new AppError("No se encontró un usuario con ese ID para eliminar", 404)
      );
    }

    // Si el usuario existe, lo eliminamos.
    await prisma.user.delete({ where: { id } });

    // Es estándar responder con 204 No Content para una eliminación exitosa.
    res.status(204).send();
  }
);
