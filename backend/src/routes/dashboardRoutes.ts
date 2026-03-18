import { Router } from "express";
import {
  getDashboardStats,
  getSalesStats,
  getDashboardOverview,
  getAgentStats,
} from "@/controllers/dashboardController";
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import { AnalyticsQuerySchema } from "@/schemas/commonSchemas";

const router = Router();

router.use(protect);

router.get("/stats", validate(AnalyticsQuerySchema), getDashboardStats);
router.get("/sales-stats", validate(AnalyticsQuerySchema), getSalesStats);
router.get("/overview", validate(AnalyticsQuerySchema), getDashboardOverview);
router.get("/agent-stats", validate(AnalyticsQuerySchema), getAgentStats);

export default router;
