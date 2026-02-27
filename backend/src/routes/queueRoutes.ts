import express from "express";
import {
  createQueue,
  getQueues,
  updateQueue,
  deleteQueue,
} from "@/controllers/queueController";
import { protect } from "@/middleware/authMiddleware";
import { checkPlanLimit } from "@/middleware/planLimitsMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import {
  CreateQueueSchema,
  UpdateQueueSchema,
  QueueIdParamSchema,
} from "@/schemas/queueSchema";

const router = express.Router();

router.use(protect);

router
  .route("/")
  .get(getQueues)
  .post(checkPlanLimit("queues"), validate(CreateQueueSchema), createQueue);

router
  .route("/:id")
  .patch(validate(UpdateQueueSchema), updateQueue)
  .delete(validate(QueueIdParamSchema), deleteQueue);

export default router;

