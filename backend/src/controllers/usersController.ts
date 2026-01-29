import { Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { userService } from "@/services/userService";

/**
 * ==========================================
 * USER CONTROLLER
 * ==========================================
 *
 * Responsabilidades:
 * - Extraer datos de la Request (body, params, query, user)
 * - Validar input básico (validación de negocio está en Service)
 * - Llamar al Service correspondiente
 * - Formatear y enviar Response
 * - Delegar errores al middleware de error handling
 *
 * NO debe contener:
 * - Queries Prisma directas
 * - Lógica de negocio
 * - Transformaciones de datos complejas
 */

// ==================== GET USERS ====================

/**
 * GET /api/users
 * Lista todos los usuarios con filtros opcionales
 */
export const getUsers = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 1. Extraer parámetros de la request
    const { role } = req.query;
    const companyId = req.companyId || req.user?.companyId;

    // 2. Llamar al servicio
    const users = await userService.findUsers({
      companyId,
      role: role as string,
    });

    // 3. Enviar response
    res.status(200).json({
      status: "success",
      results: users.length,
      data: { users },
    });
  },
);

// ==================== CREATE USER ====================

/**
 * POST /api/users
 * Crea un nuevo usuario (Solo ADMIN/MASTER)
 */
export const createUser = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 1. Extraer datos de la request
    const { name, email, password, role, maxConcurrency, skills } = req.body;
    const companyId = req.companyId || req.user?.companyId;
    const currentUserRole = req.user?.role;

    // 2. Validación básica de input
    if (!companyId) {
      return next(
        new AppError("No se pudo determinar la compañía del usuario.", 400),
      );
    }

    if (!name || !email || !password) {
      return next(
        new AppError("Nombre, email y contraseña son requeridos.", 400),
      );
    }

    // 3. Llamar al servicio (delegamos validación de roles y creación)
    const newUser = await userService.createUser(
      {
        name,
        email,
        password,
        role,
        companyId,
        maxConcurrency,
        skills,
      },
      currentUserRole || "USER",
    );

    // 4. Enviar response
    res.status(201).json({
      status: "success",
      data: { user: newUser },
    });
  },
);

// ==================== GET USER BY ID ====================

/**
 * GET /api/users/:id
 * Obtiene un usuario específico por ID
 */
export const getUser = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 1. Extraer ID de params
    const { id } = req.params;

    // 2. Llamar al servicio (maneja error 404 internamente)
    const user = await userService.findUserById(id);

    // 3. Enviar response
    res.status(200).json({
      status: "success",
      data: { user },
    });
  },
);

// ==================== UPDATE USER ====================

/**
 * PATCH /api/users/:id
 * Actualiza un usuario existente
 */
export const updateUser = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 1. Extraer datos de la request
    const { id } = req.params;
    const {
      email,
      name,
      phone,
      about,
      preferences,
      queueIds,
      profilePicUrl,
      role,
      maxConcurrency,
      skills,
    } = req.body;

    const currentUserId = req.user?.id || "";
    const currentUserRole = req.user?.role || "USER";
    const companyId = req.companyId || req.user?.companyId || "";

    // 2. Llamar al servicio (maneja validaciones de permisos)
    const updatedUser = await userService.updateUser(
      {
        id,
        email,
        name,
        phone,
        about,
        preferences,
        queueIds,
        profilePicUrl,
        role,
        maxConcurrency,
        skills,
      },
      currentUserId,
      currentUserRole,
      companyId,
    );

    // 3. Enviar response
    res.status(200).json({
      status: "success",
      data: { user: updatedUser },
    });
  },
);

// ==================== DELETE USER ====================

/**
 * DELETE /api/users/:id
 * Elimina un usuario (con validaciones de seguridad)
 */
export const deleteUser = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 1. Extraer datos de la request
    const { id } = req.params;
    const currentUserRole = req.user?.role || "USER";
    const companyId = req.companyId || req.user?.companyId;

    // 2. Validación básica
    if (!companyId && currentUserRole === "ADMIN") {
      return next(
        new AppError("No se pudo determinar la compañía del usuario.", 400),
      );
    }

    // 3. Llamar al servicio (maneja todas las validaciones de seguridad)
    await userService.deleteUser({
      userId: id,
      currentUserRole,
      companyId: companyId || "",
    });

    // 4. Enviar response (204 No Content)
    res.status(204).send();
  },
);
