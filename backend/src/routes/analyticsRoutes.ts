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
import {
  getForecast,
  getStageConversion,
  getStageVelocity,
  getLostReasons,
  getRepLeaderboard,
  getDealRisk,
  exportLeaderboard,
  exportLostReasons,
} from "../controllers/salesAnalyticsController";
import { AnalyticsQuerySchema } from "../schemas/commonSchemas";

const router = Router();

// All analytics routes require authentication
router.use(protect);

router.get("/heatmap", validate(AnalyticsQuerySchema), getHeatmap);
router.get("/agents", validate(AnalyticsQuerySchema), getAgentPerformance);
router.get("/tags", validate(AnalyticsQuerySchema), getTagAnalytics);

// [SALES] Sales analytics — forecast, stage conversion/velocity, lost
// reasons, rep leaderboard. Stage conversion/velocity read from the
// append-only DealStageHistory log, so they're sparse until it accumulates.
router.get("/sales/forecast", validate(AnalyticsQuerySchema), getForecast);
router.get("/sales/stage-conversion", getStageConversion);
router.get("/sales/stage-velocity", getStageVelocity);
router.get(
  "/sales/lost-reasons",
  validate(AnalyticsQuerySchema),
  getLostReasons,
);
router.get(
  "/sales/leaderboard",
  validate(AnalyticsQuerySchema),
  getRepLeaderboard,
);
// [SALES] Explainable per-deal risk score (stall/inactivity/overdue-task
// signals) + a stage-history-derived probability suggestion.
router.get("/sales/deal-risk", getDealRisk);
router.get(
  "/sales/export/leaderboard",
  validate(AnalyticsQuerySchema),
  exportLeaderboard,
);
router.get(
  "/sales/export/lost-reasons",
  validate(AnalyticsQuerySchema),
  exportLostReasons,
);

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
