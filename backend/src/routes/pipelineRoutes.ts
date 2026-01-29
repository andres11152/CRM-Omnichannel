import express from "express";
import {
  getPipelines,
  getPipeline,
  createPipeline,
  updatePipeline,
  deletePipeline,
  duplicatePipeline,
} from "../controllers/crm/pipelineController";

const router = express.Router();

router.route("/").get(getPipelines).post(createPipeline);

router
  .route("/:id")
  .get(getPipeline)
  .patch(updatePipeline)
  .delete(deletePipeline);

router.route("/:id/duplicate").post(duplicatePipeline);

export default router;
