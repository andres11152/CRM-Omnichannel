import express from "express";
import {
  createFlow,
  getFlows,
  getFlowById,
  updateFlow,
  deleteFlow,
  toggleFlow,
  duplicateFlow,
} from "@/controllers/flowController";
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import {
  CreateFlowSchema,
  UpdateFlowSchema,
  FlowIdParamSchema,
} from "@/schemas/flowSchema";

const router = express.Router();

router.use(protect);

router
  .route("/")
  .get(getFlows)
  .post(validate(CreateFlowSchema), createFlow);

router
  .route("/:id")
  .get(validate(FlowIdParamSchema), getFlowById)
  .put(validate(UpdateFlowSchema), updateFlow)
  .patch(validate(UpdateFlowSchema), updateFlow)
  .delete(validate(FlowIdParamSchema), deleteFlow);

router.route("/:id/toggle").patch(validate(FlowIdParamSchema), toggleFlow);

router.route("/:id/duplicate").post(validate(FlowIdParamSchema), duplicateFlow);

export default router;
