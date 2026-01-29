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

const router = express.Router();

/**
 * 🔐 ROLES & PERMISSIONS ROUTES
 * All routes require authentication
 */

// Get all roles for the authenticated user's company
router.get("/", protect, getRoles);

// Get a specific role
router.get("/:id", protect, getRole);

// Create a new role (Admin only)
router.post("/", protect, createRole);

// Update a role (Admin only)
router.patch("/:id", protect, updateRole);

// Delete a role (Admin only)
router.delete("/:id", protect, deleteRole);

// Assign role to user (Admin only)
router.post("/assign", protect, assignRoleToUser);

export default router;
