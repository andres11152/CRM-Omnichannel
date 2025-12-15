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

const router = express.Router();

router.use(protect);

router.route("/").get(getFlows).post(createFlow);

router.route("/:id").get(getFlowById).put(updateFlow).patch(updateFlow).delete(deleteFlow);

router.route("/:id/toggle").patch(toggleFlow);

router.route("/:id/duplicate").post(duplicateFlow);

export default router;
