import { Router } from "express";
import { globalSearch } from "@/controllers/searchController";
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import { GlobalSearchSchema } from "@/schemas/searchSchema";

const router = Router();

/**
 * [SEARCH] SEARCH ROUTES
 * Global search endpoints for Command Palette
 */

// @route   GET /api/search?q=xxx
// @desc    Global search across contacts, tickets, and deals
// @access  Protected + Validated
router.get("/", protect, validate(GlobalSearchSchema), globalSearch);

export default router;
