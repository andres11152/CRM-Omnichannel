import express from "express";
import {
  createCampaign,
  getCampaigns,
  getCampaign,
  updateCampaign,
  deleteCampaign,
  launchCampaign,
  getCampaignReport,
} from "@/controllers/campaignController";
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import { requireFeature } from "@/middleware/requireFeature";
import {
  CreateCampaignSchema,
  UpdateCampaignSchema,
  GetCampaignsSchema,
  GetCampaignSchema,
  DeleteCampaignSchema,
  SendCampaignSchema,
} from "@/schemas/campaignSchema";

import { auditLog } from "@/middleware/auditMiddleware";

const router = express.Router();

router.use(protect);
router.use(requireFeature("bulk_marketing"));

/**
 * [GROUP] CAMPAIGN ROUTES
 * All routes include Zod validation for security and data integrity
 */

// GET /campaigns?status=draft&channel=WHATSAPP
// POST /campaigns
router.route("/").get(validate(GetCampaignsSchema), getCampaigns).post(
  validate(CreateCampaignSchema),
  auditLog("Campaign"), // Log Creation
  createCampaign,
);

// GET /campaigns/:id
// PATCH /campaigns/:id
// DELETE /campaigns/:id
router
  .route("/:id")
  .get(validate(GetCampaignSchema), getCampaign)
  .patch(
    validate(UpdateCampaignSchema),
    auditLog("Campaign"), // Log Updates
    updateCampaign,
  )
  .delete(
    validate(DeleteCampaignSchema),
    auditLog("Campaign"), // Log Deletion
    deleteCampaign,
  );

// POST /campaigns/:id/launch
// Launch campaign execution in background
router.route("/:id/launch").post(
  validate(SendCampaignSchema),
  auditLog("Campaign", (req) => req.params.id), // Log Launch as UPDATE/ACTION
  launchCampaign,
);

// GET /campaigns/:id/report — open/click/bounce rates for EMAIL campaigns
router.route("/:id/report").get(validate(GetCampaignSchema), getCampaignReport);

export default router;
