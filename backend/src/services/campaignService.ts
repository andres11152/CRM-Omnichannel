import { Prisma } from "@prisma/client";
import { AppError } from "@/utils/AppError";
import { campaignRepository } from "@/repositories/CampaignRepository";
import {
  CreateCampaignInput,
  UpdateCampaignInput,
} from "@/schemas/campaignSchema";
import { campaignExecutionService } from "./CampaignExecutionService";

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
};
