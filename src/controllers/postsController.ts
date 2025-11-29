import { Request, Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/prisma";
import { AuthenticatedRequest } from "@/types/types";

/**
 * GET ALL POSTS
 * Obtiene una lista de todos los posts, incluyendo información básica del autor.
 */
export const getPosts = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const posts = await prisma.post.findMany({
      include: {
        author: {
          select: { id: true, name: true, email: true }, // Incluimos solo datos públicos del autor
        },
      },
      orderBy: {
        createdAt: "desc", // Mostramos los más recientes primero
      },
    });

    res.status(200).json({
      status: "success",
      results: posts.length,
      data: { posts },
    });
  }
);

/**
 * GET POST BY ID
 * Obtiene un solo post por su ID, incluyendo su autor y respuestas.
 */
export const getPost = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true } },
        replies: { include: { author: { select: { id: true, name: true } } } },
      },
    });

    if (!post) {
      return next(new AppError("No se encontró un post con ese ID", 404));
    }

    res.status(200).json({
      status: "success",
      data: { post },
    });
  }
);

/**
 * CREATE POST
 * Crea un nuevo post asociado a un autor.
 */
export const createPost = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { content } = req.body;
    const authorId = req.user && req.user.id; // Acceso explícito

    if (!authorId) {
      return next(
        new AppError("Usuario no autenticado. No se puede crear el post.", 401)
      );
    }

    const newPost = await prisma.post.create({
      data: {
        content,
        authorId,
      },
    });

    res.status(201).json({
      status: "success",
      data: { post: newPost },
    });
  }
);

/**
 * UPDATE POST
 * Actualiza el contenido de un post.
 */
export const updatePost = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { content } = req.body;

    const post = await prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      return next(new AppError("No se encontró ningún post con ese ID", 404));
    }

    if (post.authorId !== req.user?.id) {
      return next(
        new AppError("No tienes permiso para editar este post.", 403)
      );
    }

    const updatedPost = await prisma.post.update({
      where: { id },
      data: { content },
    });

    res.status(200).json({
      status: "success",
      data: { post: updatedPost },
    });
  }
);

/**
 * DELETE POST
 * Elimina un post por su ID.
 */
export const deletePost = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const post = await prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      return next(new AppError("No se encontró ningún post con ese ID", 404));
    }

    if (post.authorId !== req.user?.id) {
      return next(
        new AppError("No tienes permiso para eliminar este post.", 403)
      );
    }

    await prisma.post.delete({ where: { id } });
    res.status(204).send();
  }
);
