import express from "express";
import {
  getCatalog,
  getRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  assignRoleToUser,
} from "../controllers/rolesController";
import { protect } from "@/middleware/authMiddleware";
import { requirePermission } from "@/middleware/permissionMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import {
  CreateRoleSchema,
  UpdateRoleSchema,
  AssignRoleSchema,
  RoleIdParamSchema,
} from "@/schemas/roleSchema";

const router = express.Router();

/**
 * [AUTH] ROLES & PERMISSIONS ROUTES
 *
 * Todas requieren autenticación + permiso de gestión de roles
 * (TEAM/MANAGE/roles). MASTER y ADMIN lo tienen implícito; los roles
 * personalizados deben tener el permiso explícito.
 */
const canManageRoles = requirePermission("TEAM", "MANAGE", "roles");

// Catálogo de permisos (para el editor del frontend)
router.get("/catalog", protect, canManageRoles, getCatalog);

// Get all roles for the authenticated user's company
router.get("/", protect, canManageRoles, getRoles);

// Get a specific role
router.get("/:id", protect, canManageRoles, validate(RoleIdParamSchema), getRole);

// Create a new role
router.post("/", protect, canManageRoles, validate(CreateRoleSchema), createRole);

// Update a role
router.patch("/:id", protect, canManageRoles, validate(UpdateRoleSchema), updateRole);

// Delete a role
router.delete("/:id", protect, canManageRoles, validate(RoleIdParamSchema), deleteRole);

// Assign role to user
router.post("/assign", protect, canManageRoles, validate(AssignRoleSchema), assignRoleToUser);

export default router;
