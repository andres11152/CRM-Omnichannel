import { Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { replyService } from "@/services/replyService";
import { AuthenticatedRequest } from "@/types/types";

export const getRepliesForPost = catchAsync(
  async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    const { postId } = req.params;
    const companyId = req.user?.companyId;
    if (!companyId) throw new AppError("Unauthorized", 401);
    const replies = await replyService.findByPost(postId, companyId);

    res.status(200).json({
      status: "success",
      results: replies.length,
      data: { replies },
    });
  },
);

export const createReply = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { content, postId } = req.body;
    const authorId = req.user?.id;

    if (!authorId) {
      return next(
        new AppError(
          "Usuario no autenticado. No se puede crear la respuesta.",
          401,
        ),
      );
    }

    const newReply = await replyService.create(authorId, postId, content);

    res.status(201).json({
      status: "success",
      data: { reply: newReply },
    });
  },
);

export const updateReply = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { content } = req.body;
    const authorId = req.user?.id;

    if (!authorId) {
      return next(new AppError("Usuario no autenticado", 401));
    }

    const companyId = req.user?.companyId;
    if (!companyId) return next(new AppError("Unauthorized", 401));

    const updatedReply = await replyService.update(
      id,
      authorId,
      companyId,
      content,
    );

    res.status(200).json({
      status: "success",
      data: { reply: updatedReply },
    });
  },
);

export const deleteReply = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const authorId = req.user?.id;

    if (!authorId) {
      return next(new AppError("Usuario no autenticado", 401));
    }

    const companyId = req.user?.companyId;
    if (!companyId) return next(new AppError("Unauthorized", 401));

    await replyService.delete(id, authorId, companyId);
    res.status(204).send();
  },
);
