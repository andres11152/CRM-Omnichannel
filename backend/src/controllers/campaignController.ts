import { Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/database";
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
    const {
      name,
      messageContent,
      targetTags,
      config,
      templateId,
      channel,
      subject,
      status,
    } = req.body;
    const companyId = req.companyId || req.user?.companyId;
    const userId = req.user?.id;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    const initialStats = {
      targetAudienceSize: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
    };

    const campaign = await prisma.campaign.create({
      data: {
        companyId,
        name,
        messageContent: messageContent || "",
        targetTags: targetTags || [],
        config: config || {},
        templateId: templateId || undefined,
        status: status || "draft",
        stats: initialStats,
        channel: channel || "WHATSAPP",
        subject: subject || undefined,
        createdById: userId || undefined,
      },
    });

    Logger.info(
      `[Campaign] Created new campaign: ${campaign.name} (${campaign.id})`
    );

    res.status(201).json({
      status: "success",
      data: { campaign },
    });

    // Auto-execute if status is 'sending'
    if (status === "sending") {
      Logger.info(
        `[Campaign] Auto-launching campaign ${campaign.id} (status=sending)`
      );
      campaignService
        .executeCampaign(campaign.id, companyId)
        .catch((err: any) => {
          Logger.error(`[Campaign] Auto-launch error for ${campaign.id}:`, err);
        });
    }
  }
);

/**
 * GET /campaigns
 * List all campaigns for company
 */
export const getCampaigns = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return res
        .status(200)
        .json({ status: "success", results: 0, data: { campaigns: [] } });
    }

    const { status, search, limit, offset } = req.query as any;

    const where: any = { companyId };

    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { messageContent: { contains: search, mode: "insensitive" } },
      ];
    }

    const campaigns = await prisma.campaign.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit ? parseInt(limit) : 50,
      skip: offset ? parseInt(offset) : 0,
    });

    res.status(200).json({
      status: "success",
      results: campaigns.length,
      data: { campaigns },
    });
  }
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

    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!campaign) {
      return next(new AppError("Campaign not found", 404));
    }

    // Calculate performance metrics
    const stats = (campaign.stats as any) || {};
    const sent = stats.sent || 0;
    const failed = stats.failed || 0;
    const targetAudienceSize = stats.targetAudienceSize || 0;

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
  }
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
    const existing = await prisma.campaign.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      return next(new AppError("Campaign not found", 404));
    }

    // Check if trying to launch (change status to 'sending')
    const isLaunching =
      data.status === "sending" && existing.status !== "sending";

    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        name: data.name,
        messageContent: data.messageContent,
        targetTags: data.targetTags,
        config: data.config,
        status: data.status,
        templateId: data.templateId,
        channel: data.channel,
        subject: data.subject,
      },
    });

    Logger.info(
      `[Campaign] Updated campaign: ${campaign.name} (${campaign.id})`
    );

    res.status(200).json({
      status: "success",
      data: { campaign },
    });

    // Auto-execute if status changed to 'sending'
    if (isLaunching) {
      Logger.info(
        `[Campaign] Launching campaign ${campaign.id} (status updated to sending)`
      );
      campaignService.executeCampaign(id, companyId).catch((err: any) => {
        Logger.error(`[Campaign] Launch error for ${id}:`, err);
      });
    }
  }
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
    const existing = await prisma.campaign.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      return next(new AppError("Campaign not found", 404));
    }

    // Soft delete will be handled by Prisma middleware
    await prisma.campaign.delete({
      where: { id },
    });

    Logger.info(`[Campaign] Deleted campaign: ${existing.name} (${id})`);

    res.status(204).send();
  }
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

    // Verify campaign exists
    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId },
    });

    if (!campaign) {
      return next(new AppError("Campaign not found", 404));
    }

    // Check if campaign can be launched
    if (campaign.status === "sending") {
      return next(new AppError("Campaign is already running", 400));
    }

    if (campaign.status === "completed") {
      return next(
        new AppError(
          "Campaign already completed. Create a new campaign to send again.",
          400
        )
      );
    }

    Logger.info(`[Campaign] Launching campaign: ${campaign.name} (${id})`);

    // Update status to sending (optimistic)
    await prisma.campaign.update({
      where: { id },
      data: {
        status: "sending",
        stats: {
          ...((campaign.stats as any) || {}),
          launchedAt: new Date().toISOString(),
        },
      },
    });

    // Execute in background (don't await - respond immediately)
    campaignService.executeCampaign(id, companyId).catch((err: any) => {
      Logger.error(`[Campaign] Launch error for ${id}:`, err);
    });

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
  }
);
