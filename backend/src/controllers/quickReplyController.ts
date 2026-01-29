import { Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { prisma } from "@/config/database";

export const getQuickReplies = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) {
      throw new AppError("Not authorized", 401);
    }

    const replies = await (prisma as any).quickReply.findMany({
      where: { companyId: req.companyId },
      orderBy: { title: "asc" },
    });

    res.status(200).json({
      status: "success",
      results: replies.length,
      data: { replies },
    });
  }
);

export const createQuickReply = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) {
      throw new AppError("Not authorized", 401);
    }

    const { title, content, category } = req.body;

    if (!title || !content) {
      throw new AppError("Title and content are required", 400);
    }

    const reply = await (prisma as any).quickReply.create({
      data: {
        companyId: req.companyId,
        title,
        content,
        category,
      },
    });

    res.status(201).json({
      status: "success",
      data: { reply },
    });
  }
);

export const updateQuickReply = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) {
      throw new AppError("Not authorized", 401);
    }

    const { title, content, category } = req.body;

    const reply = await (prisma as any).quickReply.findUnique({
      where: { id: req.params.id },
    });

    if (!reply || reply.companyId !== req.companyId) {
      throw new AppError("Quick reply not found", 404);
    }

    const updatedReply = await (prisma as any).quickReply.update({
      where: { id: req.params.id },
      data: {
        title,
        content,
        category,
      },
    });

    res.status(200).json({
      status: "success",
      data: { reply: updatedReply },
    });
  }
);

export const deleteQuickReply = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) {
      throw new AppError("Not authorized", 401);
    }

    const reply = await (prisma as any).quickReply.findUnique({
      where: { id: req.params.id },
    });

    if (!reply || reply.companyId !== req.companyId) {
      throw new AppError("Quick reply not found", 404);
    }

    await (prisma as any).quickReply.delete({
      where: { id: req.params.id },
    });

    res.status(204).json({
      status: "success",
      data: null,
    });
  }
);
