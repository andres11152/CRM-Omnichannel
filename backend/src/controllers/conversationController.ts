import { Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { conversationService } from "@/services/conversationService";
import { Channel } from "@prisma/client";

export const createConversation = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { phone, name, message, addToContacts } = req.body;

    if (!phone) throw new AppError("Phone number is required", 400);
    if (!req.companyId || !req.user) throw new AppError("Not authorized", 401);

    const conversation = await conversationService.createConversation({
      companyId: req.companyId,
      agentId: req.user.id,
      phone,
      name,
      message,
      addToContacts,
    });

    res.status(201).json({
      status: "success",
      data: { conversation },
    });
  },
);

export const listConversations = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId || !req.user) throw new AppError("Not authorized", 401);

    const conversations = await conversationService.listConversations(
      req.companyId,
      req.user.id,
      req.user.role,
    );

    res.status(200).json({
      status: "success",
      results: conversations.length,
      data: { conversations },
    });
  },
);

export const getConversation = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) throw new AppError("Not authorized", 401);

    const conversation = await conversationService.getConversation(
      req.companyId,
      req.params.id,
    );

    res.status(200).json({
      status: "success",
      data: { conversation },
    });
  },
);

export const replyToConversation = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user || !req.companyId) throw new AppError("Not authorized", 401);

    const { content, channel, attachment, metadata, scheduledAt } = req.body;

    // Validate Channel Enum
    let targetChannel: Channel | undefined;
    if (channel && Object.values(Channel).includes(channel as Channel)) {
      targetChannel = channel as Channel;
    }

    const message = await conversationService.replyToConversation({
      companyId: req.companyId,
      userId: req.user.id,
      conversationId: req.params.id,
      content,
      channel: targetChannel,
      attachment,
      metadata,
      scheduledAt,
    });

    res.status(201).json({
      status: "success",
      data: { message },
    });
  },
);

export const updateTags = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) throw new AppError("Not authorized", 401);
    const { tags } = req.body;

    if (!Array.isArray(tags)) throw new AppError("Tags must be an array", 400);

    const conversation = await conversationService.updateTags(
      req.companyId,
      req.params.id,
      tags,
    );

    res.status(200).json({
      status: "success",
      data: { tags: conversation.tags },
    });
  },
);
