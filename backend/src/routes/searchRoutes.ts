import { Router } from "express";
import { globalSearch } from "@/controllers/searchController";
import { protect } from "@/middleware/authMiddleware";

const router = Router();

/**
 * 🔍 SEARCH ROUTES
 * Global search endpoints for Command Palette
 */

// @route   GET /api/search
// @desc    Global search across contacts, tickets, and deals
// @access  Protected
router.get("/", protect, globalSearch);

export default router;
