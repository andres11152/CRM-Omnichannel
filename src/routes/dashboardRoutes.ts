import { Router } from "express";
import {
  getDashboardStats,
  getSalesStats,
} from "@/controllers/dashboardController";
import { protect } from "@/middleware/authMiddleware";

const router = Router();

router.use(protect);

router.get("/stats", getDashboardStats);
router.get("/sales-stats", getSalesStats);

export default router;
