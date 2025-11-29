import { Request, Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/prisma";
import { AuthenticatedRequest } from "@/types/types";

/**
 * GET REPLIES FOR A POST
 * Obtiene todas las respuestas para un post específico.
 */
export const getRepliesForPost = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { postId } = req.params;
    const replies = await prisma.reply.findMany({
      where: { postId },
      include: {
        author: { select: { id: true, name: true } },
      },
      orderBy: {
        createdAt: "asc", // Mostrar en orden cronológico
      },
    });

    res.status(200).json({
      status: "success",
      results: replies.length,
      data: { replies },
    });
  }
);

/**
 * CREATE REPLY
 * Crea una nueva respuesta para un post, de parte de un autor.
 */
export const createReply = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { content, postId } = req.body;
    const authorId = req.user && req.user.id; // Acceso explícito

    if (!authorId) {
      return next(
        new AppError(
          "Usuario no autenticado. No se puede crear la respuesta.",
          401
        )
      );
    }

    const newReply = await prisma.reply.create({
      data: { content, authorId, postId },
    });

    res.status(201).json({
      status: "success",
      data: { reply: newReply },
    });
  }
);

/**
 * UPDATE REPLY
 * Actualiza el contenido de una respuesta.
 */
export const updateReply = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { content } = req.body;

    const reply = await prisma.reply.findUnique({
      where: { id },
    });

    if (!reply) {
      return next(
        new AppError("No se encontró ninguna respuesta con ese ID", 404)
      );
    }

    if (reply.authorId !== req.user?.id) {
      return next(
        new AppError("No tienes permiso para editar esta respuesta.", 403)
      );
    }

    const updatedReply = await prisma.reply.update({
      where: { id },
      data: { content },
    });

    res.status(200).json({
      status: "success",
      data: { reply: updatedReply },
    });
  }
);

/**
 * DELETE REPLY
 * Elimina una respuesta por su ID.
 */
export const deleteReply = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const reply = await prisma.reply.findUnique({
      where: { id },
    });

    if (!reply) {
      return next(
        new AppError("No se encontró ninguna respuesta con ese ID", 404)
      );
    }

    if (reply.authorId !== req.user?.id) {
      return next(
        new AppError("No tienes permiso para eliminar esta respuesta.", 403)
      );
    }

    await prisma.reply.delete({ where: { id } });
    res.status(204).send();
  }
);
