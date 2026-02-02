import { Request, Response, NextFunction } from "express";
import { rolesService } from "@/services/rolesService";
import { PermissionModule, PermissionAction } from "@/types/role.types";
import { HTTP_STATUS } from "@/constants/httpStatus";

export const requirePermission = (
  module: PermissionModule,
  action: PermissionAction,
  resource: string = "*",
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res
          .status(HTTP_STATUS.UNAUTHORIZED)
          .json({ error: "No autorizado" });
      }

      const hasPermission = await rolesService.checkPermission(
        userId,
        module,
        action,
        resource,
      );

      if (!hasPermission) {
        return res
          .status(HTTP_STATUS.FORBIDDEN)
          .json({ error: "No tienes permisos para realizar esta acción" });
      }

      next();
    } catch (error) {
      console.error("Error checking permission middleware:", error);
      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json({ error: "Error de servidor verificando permisos" });
    }
  };
};
