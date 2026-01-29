import express from "express";
import {
  createQueue,
  getQueues,
  updateQueue,
  deleteQueue,
} from "@/controllers/queueController";
import { protect } from "@/middleware/authMiddleware";
import { checkPlanLimit } from "@/middleware/planLimitsMiddleware";

const router = express.Router();

router.use(protect);

router.route("/").get(getQueues).post(checkPlanLimit("queues"), createQueue);

router.route("/:id").patch(updateQueue).delete(deleteQueue);

export default router;
