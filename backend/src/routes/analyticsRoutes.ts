import { Router } from "express";
import { protect } from "../middleware/authMiddleware";
import { validate } from "../middleware/validationMiddleware";
import {
  getHeatmap,
  getAgentPerformance,
  getTagAnalytics,
  exportAgentPerformance,
  exportTicketAnalytics,
} from "../controllers/analyticsController";
import { AnalyticsQuerySchema } from "../schemas/commonSchemas";

const router = Router();

// Todas las rutas de analítica requieren autenticación
router.use(protect);

router.get("/heatmap", validate(AnalyticsQuerySchema), getHeatmap);
router.get("/agents", validate(AnalyticsQuerySchema), getAgentPerformance);
router.get("/tags", validate(AnalyticsQuerySchema), getTagAnalytics);

// [STAT] Export Routes
router.get(
  "/export/agents",
  validate(AnalyticsQuerySchema),
  exportAgentPerformance,
);
router.get(
  "/export/tickets",
  validate(AnalyticsQuerySchema),
  exportTicketAnalytics,
);

export default router;
