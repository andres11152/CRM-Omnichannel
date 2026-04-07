import { Request, Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { postService } from "@/services/PostService";

/**
 *  POST CONTROLLER
 *
 * HTTP orchestrator for internal posts/feed.
 * [SEC] All operations scoped by companyId for multi-tenant isolation.
 * All data access delegated to postService (SRP).
 */

/**
 * GET ALL POSTS (scoped to company)
 */
export const getPosts = catchAsync(
  async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    const companyId = req.user?.companyId || req.companyId;
    if (!companyId) throw new AppError("Company context missing", 401);

    const posts = await postService.findAll(companyId);

    res.status(200).json({
      status: "success",
      results: posts.length,
      data: { posts },
    });
  },
);

/**
 * GET POST BY ID (scoped to company)
 */
export const getPost = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId || req.companyId;
    if (!companyId) throw new AppError("Company context missing", 401);

    const { id } = req.params;
    const post = await postService.findOne(companyId, id);

    if (!post) {
      return next(new AppError("No se encontró un post con ese ID", 404));
    }

    res.status(200).json({
      status: "success",
      data: { post },
    });
  },
);

/**
 * CREATE POST (scoped to company)
 */
export const createPost = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { content } = req.body;
    const authorId = req.user?.id;
    const companyId = req.user?.companyId || req.companyId;

    if (!authorId || !companyId) {
      return next(
        new AppError("Usuario no autenticado. No se puede crear el post.", 401),
      );
    }

    const newPost = await postService.create(companyId, authorId, content);

    res.status(201).json({
      status: "success",
      data: { post: newPost },
    });
  },
);

/**
 * UPDATE POST (scoped to company)
 */
export const updatePost = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user?.id;
    const companyId = req.user?.companyId || req.companyId;

    if (!userId || !companyId) {
      return next(new AppError("Not authenticated", 401));
    }

    const updatedPost = await postService.update(
      companyId,
      id,
      userId,
      content,
    );

    res.status(200).json({
      status: "success",
      data: { post: updatedPost },
    });
  },
);

/**
 * DELETE POST (scoped to company)
 */
export const deletePost = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const userId = req.user?.id;
    const companyId = req.user?.companyId || req.companyId;

    if (!userId || !companyId) {
      return next(new AppError("Not authenticated", 401));
    }

    await postService.delete(companyId, id, userId);
    res.status(204).send();
  },
);
