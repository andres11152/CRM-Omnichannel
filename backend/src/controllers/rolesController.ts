import { Request, Response } from "express";
import { rolesService } from "@/services/RolesService";
import { HTTP_STATUS } from "@/constants/httpStatus";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { PERMISSION_CATALOG } from "@/constants/permissions";

/**
 * [AUTH] ROLES CONTROLLER
 * Facade for RBAC operations
 */

export const rolesController = {
  /** Catálogo de permisos (fuente única para el editor del frontend). */
  getCatalog: catchAsync(async (_req: Request, res: Response) => {
    res.json({ catalog: PERMISSION_CATALOG });
  }),

  getRoles: catchAsync(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId)
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED);

    const roles = await rolesService.findAll(companyId);
    res.json({ roles });
  }),

  getRole: catchAsync(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const { id } = req.params;

    if (!companyId)
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED);

    const role = await rolesService.findOne(companyId, id);
    res.json({ role });
  }),

  createRole: catchAsync(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId)
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED);

    const role = await rolesService.create(companyId, req.body);

    res.status(HTTP_STATUS.CREATED).json({
      message: "Rol creado exitosamente",
      role,
    });
  }),

  updateRole: catchAsync(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const { id } = req.params;

    if (!companyId)
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED);

    const role = await rolesService.update(companyId, id, req.body);

    res.json({
      message: "Rol actualizado exitosamente",
      role,
    });
  }),

  deleteRole: catchAsync(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const { id } = req.params;

    if (!companyId)
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED);

    await rolesService.delete(companyId, id);
    res.json({ message: "Rol eliminado exitosamente" });
  }),

  assignRoleToUser: catchAsync(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const { userId, roleId } = req.body;

    if (!companyId)
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED);

    await rolesService.assignToUser(companyId, userId, roleId);

    res.json({ message: "Rol asignado exitosamente" });
  }),
};

// Exports for backward compatibility
export const getCatalog = rolesController.getCatalog;
export const getRoles = rolesController.getRoles;
export const getRole = rolesController.getRole;
export const createRole = rolesController.createRole;
export const updateRole = rolesController.updateRole;
export const deleteRole = rolesController.deleteRole;
export const assignRoleToUser = rolesController.assignRoleToUser;

export { requirePermission } from "@/middleware/permissionMiddleware";
export const checkPermission = rolesService.checkPermission;
