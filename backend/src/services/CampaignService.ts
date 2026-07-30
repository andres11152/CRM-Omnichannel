import { Prisma } from "@prisma/client";
import { AppError } from "@/utils/AppError";
import { campaignRepository } from "@/repositories/CampaignRepository";
import { emailRepository } from "@/repositories/EmailRepository";
import {
  CreateCampaignInput,
  UpdateCampaignInput,
} from "@/schemas/campaignSchema";
import { campaignExecutionService } from "./CampaignExecutionService";

export interface CampaignEmailReport {
  channel: string;
  totalSent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  spam: number;
  failed: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

/**
 *  CAMPAIGN CRUD SERVICE
 *
 * Handles creation, retrieval, and updates of campaigns.
 * Execution logic is delegated to CampaignExecutionService (SRP).
 */

export const campaignService = {
  async createCampaign(
    companyId: string,
    userId: string,
    data: CreateCampaignInput,
  ) {
    const initialStats = {
      targetAudienceSize: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
    };
    return await campaignRepository.create({
      data: {
        companyId,
        name: data.name,
        messageContent: data.messageContent || "",
        targetTags: data.targetTags || [],
        config: data.config || {},
        templateId: data.templateId || undefined,
        status: data.status || "draft",
        stats: initialStats,
        channel: data.channel || "WHATSAPP",
        subject: data.subject || undefined,
        createdById: userId || undefined,
      },
    });
  },

  async getCampaigns(companyId: string, filters: Record<string, unknown>) {
    const { status, search, limit, offset } = filters;
    const where: Prisma.CampaignWhereInput = { companyId };
    if (status) where.status = status as string;
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { messageContent: { contains: search as string, mode: "insensitive" } },
      ];
    }
    return await campaignRepository.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit ? parseInt(limit as string) : 50,
      skip: offset ? parseInt(offset as string) : 0,
    });
  },

  async getCampaign(id: string, companyId: string) {
    return await campaignRepository.findFirst({
      where: { id, companyId },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  },

  async updateCampaign(
    id: string,
    companyId: string,
    data: UpdateCampaignInput,
  ) {
    return await campaignRepository.update({
      where: { id },
      data: {
        name: data.name,
        messageContent: data.messageContent,
        targetTags: data.targetTags,
        config: data.config
          ? (data.config as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        status: data.status,
        templateId: data.templateId,
        channel: data.channel,
        subject: data.subject,
      },
    });
  },

  async deleteCampaign(id: string, companyId: string) {
    return await campaignRepository.delete(id, companyId);
  },

  async launchCampaign(id: string, companyId: string) {
    return await campaignExecutionService.launchCampaign(id, companyId);
  },

  /**
   * Real open/click/bounce rates for an EMAIL campaign, computed from the
   * Email rows it actually created — not the coarse sent/failed counters
   * CampaignExecutionService tracks during the send itself.
   */
  async getCampaignReport(id: string, companyId: string): Promise<CampaignEmailReport> {
    const campaign = await campaignRepository.findFirst({ where: { id, companyId } });
    if (!campaign) throw new AppError("Campaign not found", 404);

    const grouped = await emailRepository.countByCampaignStatus(id, companyId);
    const counts: Record<string, number> = {};
    for (const row of grouped) {
      counts[row.status] = row._count._all;
    }

    const totalSent = Object.values(counts).reduce((sum, n) => sum + n, 0);
    const delivered = counts.DELIVERED || 0;
    const opened = counts.OPENED || 0;
    const clicked = counts.CLICKED || 0;
    const bounced = counts.BOUNCED || 0;
    const spam = counts.SPAM || 0;
    const failed = counts.FAILED || 0;

    return {
      channel: campaign.channel,
      totalSent,
      delivered,
      opened,
      clicked,
      bounced,
      spam,
      failed,
      openRate: totalSent > 0 ? Math.round((opened / totalSent) * 100) : 0,
      clickRate: totalSent > 0 ? Math.round((clicked / totalSent) * 100) : 0,
      bounceRate: totalSent > 0 ? Math.round((bounced / totalSent) * 100) : 0,
    };
  },
};
