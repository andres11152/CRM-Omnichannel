import express from "express";
import {
  getActivities,
  createActivity,
  updateActivity,
  deleteActivity,
} from "../controllers/crm/activityController";

const router = express.Router();

router.route("/").get(getActivities).post(createActivity);

router.route("/:id").patch(updateActivity).delete(deleteActivity);

export default router;
