import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { AppError } from "@/utils/AppError";
import { UserRole } from "@prisma/client";

/**
 * [SEC] ROLE-BASED ACCESS CONTROL MIDDLEWARE
 *
 * Usage: router.post("/", protect, restrictTo("ADMIN", "MASTER"), handler)
 *
 * Ensures only users with the specified roles can access the route.
 * Must be used AFTER the `protect` middleware (which sets req.user).
 */
export const restrictTo = (...roles: UserRole[]) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const userRole = req.user?.role as UserRole | undefined;

    if (!userRole) {
      return next(
        new AppError("No tienes permisos para realizar esta acción.", 403),
      );
    }

    if (!roles.includes(userRole)) {
      return next(
        new AppError(
          `Acceso restringido. Se requiere rol: ${roles.join(", ")}`,
          403,
        ),
      );
    }

    next();
  };
};
