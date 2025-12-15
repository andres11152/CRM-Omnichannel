import express from "express";
import {
  getStages,
  createStage,
  updateStage,
  reorderStages,
  deleteStage,
} from "../controllers/crm/stageController";

const router = express.Router({ mergeParams: true }); // Allow access to :pipelineId

// All routes are prefixed with /pipelines/:pipelineId/stages
router.route("/").get(getStages).post(createStage);

router.route("/reorder").patch(reorderStages);

router.route("/:id").patch(updateStage).delete(deleteStage);

export default router;
