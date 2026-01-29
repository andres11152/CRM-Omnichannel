import { Router } from "express";
import { protect } from "@/middleware/authMiddleware";
import { getUsageStats } from "@/controllers/usageController";

const router = Router();

// All routes require authentication
router.use(protect);

// GET /api/usage/stats - Get current usage vs plan limits
router.get("/stats", getUsageStats);

export default router;
