import { Router } from "express";
import {
  getDashboardStats,
  getSalesStats,
  getDashboardOverview,
  getAgentStats,
} from "@/controllers/dashboardController";
import { protect } from "@/middleware/authMiddleware";

const router = Router();

router.use(protect);

router.get("/stats", getDashboardStats);
router.get("/sales-stats", getSalesStats);
router.get("/overview", getDashboardOverview);
router.get("/agent-stats", getAgentStats);

export default router;
