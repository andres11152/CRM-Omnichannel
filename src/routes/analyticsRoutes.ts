import { Router } from "express";
import { protect } from "../middleware/authMiddleware";
import {
  getHeatmap,
  getAgentPerformance,
  getTagAnalytics,
  exportAgentPerformance,
  exportTicketAnalytics,
} from "../controllers/analyticsController";

const router = Router();

// Todas las rutas de analítica requieren autenticación
router.use(protect);

router.get("/heatmap", getHeatmap);
router.get("/agents", getAgentPerformance);
router.get("/tags", getTagAnalytics);

// 📊 Export Routes
router.get("/export/agents", exportAgentPerformance);
router.get("/export/tickets", exportTicketAnalytics);

export default router;
