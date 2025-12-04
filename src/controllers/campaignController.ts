import { Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/prisma";
import { AuthenticatedRequest } from "@/types/types";

export const createCampaign = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { name, messageContent, targetTags, config, templateId } = req.body;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    const id = randomUUID();
    const now = new Date();
    const initialStats = {
      targetAudienceSize: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      replied: 0,
    };

    try {
      await prisma.$executeRaw`
            INSERT INTO campaigns (id, "companyId", name, "messageContent", "targetTags", config, "templateId", status, stats, "createdAt", "updatedAt", channel, subject)
            VALUES (${id}, ${companyId}, ${name}, ${messageContent}, ${
        targetTags || []
      }, ${
        config || {}
      }::jsonb, ${templateId}, 'draft', ${initialStats}::jsonb, ${now}, ${now}, ${
        req.body.channel || "WHATSAPP"
      }::"Channel", ${req.body.subject || null})
        `;

      const result =
        await prisma.$queryRaw`SELECT * FROM campaigns WHERE id = ${id}`;
      const campaign = (result as any[])[0];

      res.status(201).json({
        status: "success",
        data: { campaign },
      });
    } catch (error) {
      console.error("Error creating campaign:", error);
      return next(new AppError("Failed to create campaign", 500));
    }
  }
);

export const getCampaigns = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return res
        .status(200)
        .json({ status: "success", results: 0, data: { campaigns: [] } });
    }

    try {
      const campaigns = await prisma.$queryRaw`
            SELECT * FROM campaigns 
            WHERE "companyId" = ${companyId} 
            ORDER BY "createdAt" DESC
        `;

      res.status(200).json({
        status: "success",
        results: (campaigns as any[]).length,
        data: { campaigns },
      });
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      return next(new AppError("Failed to fetch campaigns", 500));
    }
  }
);

export const updateCampaign = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;
    const data = req.body;

    const existing =
      await prisma.$queryRaw`SELECT * FROM campaigns WHERE id = ${id} AND "companyId" = ${companyId}`;
    if (!(existing as any[]).length) {
      return next(new AppError("Campaign not found", 404));
    }

    const now = new Date();

    // Simplification: We only update commonly changed fields for now.
    // Ideally we should construct dynamic query or update all allowed fields.
    const current = (existing as any[])[0];

    const newName = data.name !== undefined ? data.name : current.name;
    const newMessage =
      data.messageContent !== undefined
        ? data.messageContent
        : current.messageContent;
    const newTags =
      data.targetTags !== undefined ? data.targetTags : current.targetTags;
    const newConfig = data.config !== undefined ? data.config : current.config;
    const newStatus = data.status !== undefined ? data.status : current.status;
    const newTemplateId =
      data.templateId !== undefined ? data.templateId : current.templateId;

    const newChannel = data.channel !== undefined ? data.channel : (current as any).channel;
    const newSubject = data.subject !== undefined ? data.subject : (current as any).subject;

    try {
      await prisma.$executeRaw`
            UPDATE campaigns 
            SET name = ${newName}, "messageContent" = ${newMessage}, "targetTags" = ${newTags}, config = ${newConfig}::jsonb, status = ${newStatus}, "templateId" = ${newTemplateId}, "updatedAt" = ${now}, channel = ${newChannel}::"Channel", subject = ${newSubject}
            WHERE id = ${id}
        `;

      const result =
        await prisma.$queryRaw`SELECT * FROM campaigns WHERE id = ${id}`;

      res.status(200).json({
        status: "success",
        data: { campaign: (result as any[])[0] },
      });
    } catch (error) {
      console.error("Error updating campaign:", error);
      return next(new AppError("Failed to update campaign", 500));
    }
  }
);

export const deleteCampaign = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    const existing =
      await prisma.$queryRaw`SELECT * FROM campaigns WHERE id = ${id} AND "companyId" = ${companyId}`;
    if (!(existing as any[]).length) {
      return next(new AppError("Campaign not found", 404));
    }

    try {
      await prisma.$executeRaw`DELETE FROM campaigns WHERE id = ${id}`;
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting campaign:", error);
      return next(new AppError("Failed to delete campaign", 500));
    }
  }
);
