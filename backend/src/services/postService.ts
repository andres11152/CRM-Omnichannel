import { AppError } from "@/utils/AppError";
import { postRepository } from "@/repositories/PostRepository";

/**
 * 📝 POST CRUD SERVICE
 *
 * Data access layer for internal posts/feed.
 */

export const postService = {
  async findAll() {
    return await postRepository.findMany({
      include: {
        author: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async findOne(id: string) {
    return await postRepository.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true } },
        replies: {
          include: { author: { select: { id: true, name: true } } },
        },
      },
    });
  },

  async create(authorId: string, content: string) {
    return await postRepository.create({
      data: { content, authorId },
    });
  },

  async update(id: string, userId: string, content: string) {
    const post = await postRepository.findUnique({ where: { id } });

    if (!post) {
      throw new AppError("No se encontró ningún post con ese ID", 404);
    }

    if (post.authorId !== userId) {
      throw new AppError("No tienes permiso para editar este post.", 403);
    }

    return await postRepository.update({
      where: { id },
      data: { content },
    });
  },

  async delete(id: string, userId: string) {
    const post = await postRepository.findUnique({ where: { id } });

    if (!post) {
      throw new AppError("No se encontró ningún post con ese ID", 404);
    }

    if (post.authorId !== userId) {
      throw new AppError("No tienes permiso para eliminar este post.", 403);
    }

    await postRepository.delete({ where: { id } });
  },
};
