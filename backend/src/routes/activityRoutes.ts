import express from "express";
import {
  getActivities,
  createActivity,
  updateActivity,
  deleteActivity,
} from "../controllers/crm/activityController";
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import {
  CreateActivitySchema,
  UpdateActivitySchema,
  ActivityIdParamSchema,
} from "@/schemas/activitySchema";

const router = express.Router();

// Apply auth middleware to all activity routes
router.use(protect);

router
  .route("/")
  .get(getActivities)
  .post(validate(CreateActivitySchema), createActivity);

router
  .route("/:id")
  .patch(validate(UpdateActivitySchema), updateActivity)
  .delete(validate(ActivityIdParamSchema), deleteActivity);

export default router;

