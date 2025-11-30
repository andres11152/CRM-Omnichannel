import express from "express";
import {
  createFlow,
  getFlows,
  updateFlow,
  deleteFlow,
} from "@/controllers/flowController";
import { protect } from "@/middleware/authMiddleware";

const router = express.Router();

router.use(protect);

router.route("/").get(getFlows).post(createFlow);

router.route("/:id").put(updateFlow).patch(updateFlow).delete(deleteFlow);

export default router;
