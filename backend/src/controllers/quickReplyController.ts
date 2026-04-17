import { Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { quickReplyService } from "@/services/QuickReplyService";

/**
 *  QUICK REPLY CONTROLLER
 *
 * HTTP orchestrator for Quick Replies.
 * All data access delegated to quickReplyService (SRP).
 */

interface QuickReplyBody {
  title: string;
  content: string;
  category?: string;
}

export const getQuickReplies = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) {
      throw new AppError("Not authorized", 401);
    }

    const replies = await quickReplyService.findAll(req.companyId);

    res.status(200).json({
      status: "success",
      results: replies.length,
      data: { replies },
    });
  },
);

export const createQuickReply = catchAsync(
  async (req: AuthenticatedRequest<any, any, QuickReplyBody>, res: Response) => {
    if (!req.companyId) {
      throw new AppError("Not authorized", 401);
    }

    const { title, content, category } = req.body;

    if (!title || !content) {
      throw new AppError("Title and content are required", 400);
    }

    const reply = await quickReplyService.create(req.companyId, {
      title,
      content,
      category,
    });

    res.status(201).json({
      status: "success",
      data: { reply },
    });
  },
);

export const updateQuickReply = catchAsync(
  async (req: AuthenticatedRequest<any, any, QuickReplyBody>, res: Response) => {
    if (!req.companyId) {
      throw new AppError("Not authorized", 401);
    }

    const { title, content, category } = req.body;

    const updatedReply = await quickReplyService.update(
      req.params.id,
      req.companyId,
      { title, content, category },
    );

    res.status(200).json({
      status: "success",
      data: { reply: updatedReply },
    });
  },
);

export const deleteQuickReply = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) {
      throw new AppError("Not authorized", 401);
    }

    await quickReplyService.delete(req.params.id, req.companyId);

    res.status(204).json({
      status: "success",
      data: null,
    });
  },
);
