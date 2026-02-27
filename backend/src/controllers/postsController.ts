import { Request, Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { postService } from "@/services/postService";

/**
 * 📝 POST CONTROLLER
 *
 * HTTP orchestrator for internal posts/feed.
 * All data access delegated to postService (SRP).
 */

/**
 * GET ALL POSTS
 */
export const getPosts = catchAsync(
  async (_req: Request, res: Response, _next: NextFunction) => {
    const posts = await postService.findAll();

    res.status(200).json({
      status: "success",
      results: posts.length,
      data: { posts },
    });
  },
);

/**
 * GET POST BY ID
 */
export const getPost = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const post = await postService.findOne(id);

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
 * CREATE POST
 */
export const createPost = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { content } = req.body;
    const authorId = req.user?.id;

    if (!authorId) {
      return next(
        new AppError("Usuario no autenticado. No se puede crear el post.", 401),
      );
    }

    const newPost = await postService.create(authorId, content);

    res.status(201).json({
      status: "success",
      data: { post: newPost },
    });
  },
);

/**
 * UPDATE POST
 */
export const updatePost = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return next(new AppError("Not authenticated", 401));
    }

    const updatedPost = await postService.update(id, userId, content);

    res.status(200).json({
      status: "success",
      data: { post: updatedPost },
    });
  },
);

/**
 * DELETE POST
 */
export const deletePost = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return next(new AppError("Not authenticated", 401));
    }

    await postService.delete(id, userId);
    res.status(204).send();
  },
);
