import express from "express";
import {
  createCampaign,
  getCampaigns,
  updateCampaign,
  deleteCampaign,
} from "@/controllers/campaignController";
import { protect } from "@/middleware/authMiddleware";

const router = express.Router();

router.use(protect);

router.route("/").get(getCampaigns).post(createCampaign);

router.route("/:id").patch(updateCampaign).delete(deleteCampaign);

export default router;
