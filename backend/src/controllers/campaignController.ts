import { Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { campaignService } from "@/services/campaignService";
import { Logger } from "@/utils/logger";

/**
 * 📢 CAMPAIGN CONTROLLER
 *
 * Handles campaign management and execution
 */

/**
 * POST /campaigns
 * Create new campaign
 */
export const createCampaign = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const data = req.body;
    const companyId = req.companyId || req.user?.companyId;
    const userId = req.user?.id;

    if (!companyId || !userId) {
      return next(new AppError("Company ID or User ID missing", 400));
    }

    const campaign = await campaignService.createCampaign(
      companyId,
      userId,
      data,
    );

    Logger.info(
      `[Campaign] Created new campaign: ${campaign.name} (${campaign.id})`,
    );

    res.status(201).json({
      status: "success",
      data: { campaign },
    });

    // Auto-execute if status is 'sending'
    if (campaign.status === "sending") {
      Logger.info(
        `[Campaign] Auto-launching campaign ${campaign.id} (status=sending)`,
      );
      campaignService
        .executeCampaign(campaign.id, companyId)
        .catch((err: unknown) => {
          Logger.error(`[Campaign] Auto-launch error for ${campaign.id}:`, err);
        });
    }
  },
);

/**
 * GET /campaigns
 * List all campaigns for company
 */
export const getCampaigns = catchAsync(
  async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return res
        .status(200)
        .json({ status: "success", results: 0, data: { campaigns: [] } });
    }

    // Rely on Zod schema to validate req.query
    const campaigns = await campaignService.getCampaigns(
      companyId,
      req.query as Record<string, string | undefined>,
    );

    res.status(200).json({
      status: "success",
      results: campaigns.length,
      data: { campaigns },
    });
  },
);

/**
 * GET /campaigns/:id
 * Get single campaign with performance metrics
 */
export const getCampaign = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    const campaign = await campaignService.getCampaign(id, companyId);

    if (!campaign) {
      return next(new AppError("Campaign not found", 404));
    }

    // Calculate performance metrics securely mapping unknown type dynamically
    const stats: Record<string, unknown> =
      campaign.stats && typeof campaign.stats === "object"
        ? (campaign.stats as Record<string, unknown>)
        : {};
    const sent = Number(stats.sent) || 0;
    const failed = Number(stats.failed) || 0;
    const targetAudienceSize = Number(stats.targetAudienceSize) || 0;

    const performance = {
      // Delivery rate: % of successful sends vs failures
      deliveryRate:
        sent + failed > 0
          ? ((sent / (sent + failed)) * 100).toFixed(2) + "%"
          : "0%",

      // Progress: % completed vs total audience
      progress:
        targetAudienceSize > 0
          ? (((sent + failed) / targetAudienceSize) * 100).toFixed(2) + "%"
          : "0%",

      // Success rate: sent vs total audience
      successRate:
        targetAudienceSize > 0
          ? ((sent / targetAudienceSize) * 100).toFixed(2) + "%"
          : stats.successRate || "0%",

      // Absolute numbers
      sent,
      failed,
      remaining: Math.max(0, targetAudienceSize - sent - failed),
      totalAudience: targetAudienceSize,
    };

    res.status(200).json({
      status: "success",
      data: {
        campaign: {
          ...campaign,
          performance,
        },
      },
    });
  },
);

/**
 * PATCH /campaigns/:id
 * Update campaign
 */
export const updateCampaign = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;
    const data = req.body;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    // Verify campaign exists
    const existing = await campaignService.getCampaign(id, companyId);

    if (!existing) {
      return next(new AppError("Campaign not found", 404));
    }

    // Check if trying to launch (change status to 'sending')
    const isLaunching =
      data.status === "sending" && existing.status !== "sending";

    const campaign = await campaignService.updateCampaign(id, companyId, data);

    Logger.info(
      `[Campaign] Updated campaign: ${campaign.name} (${campaign.id})`,
    );

    res.status(200).json({
      status: "success",
      data: { campaign },
    });

    // Auto-execute if status changed to 'sending'
    if (isLaunching) {
      Logger.info(
        `[Campaign] Launching campaign ${campaign.id} (status updated to sending)`,
      );
      campaignService.executeCampaign(id, companyId).catch((err: unknown) => {
        Logger.error(`[Campaign] Launch error for ${id}:`, err);
      });
    }
  },
);

/**
 * DELETE /campaigns/:id
 * Delete campaign (soft delete)
 */
export const deleteCampaign = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    // Verify campaign exists
    const existing = await campaignService.getCampaign(id, companyId);

    if (!existing) {
      return next(new AppError("Campaign not found", 404));
    }

    await campaignService.deleteCampaign(id);

    Logger.info(`[Campaign] Deleted campaign: ${existing.name} (${id})`);

    res.status(204).send();
  },
);

/**
 * POST /campaigns/:id/launch
 * Launch campaign execution in background
 *
 * This endpoint responds immediately and executes the campaign asynchronously.
 * Use this for explicit campaign launching (better UX than status update).
 */
export const launchCampaign = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    const campaign = await campaignService.launchCampaign(id, companyId);

    // Respond immediately (campaign running in background)
    res.status(200).json({
      status: "success",
      message: "Campaign launched successfully",
      data: {
        campaignId: id,
        campaignName: campaign.name,
        status: "sending",
        message:
          "Campaign is now running in the background. Check stats for progress.",
      },
    });
  },
);
