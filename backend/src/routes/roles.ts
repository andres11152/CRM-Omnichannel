import express from "express";
import {
  getRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  assignRoleToUser,
} from "../controllers/rolesController";
import { protect } from "@/middleware/authMiddleware";
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
 * All routes require authentication
 */

// Get all roles for the authenticated user's company
router.get("/", protect, getRoles);

// Get a specific role
router.get("/:id", protect, validate(RoleIdParamSchema), getRole);

// Create a new role (Admin only)
router.post("/", protect, validate(CreateRoleSchema), createRole);

// Update a role (Admin only)
router.patch("/:id", protect, validate(UpdateRoleSchema), updateRole);

// Delete a role (Admin only)
router.delete("/:id", protect, validate(RoleIdParamSchema), deleteRole);

// Assign role to user (Admin only)
router.post("/assign", protect, validate(AssignRoleSchema), assignRoleToUser);

export default router;

