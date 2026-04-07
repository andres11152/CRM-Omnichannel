import { AppError } from "@/utils/AppError";
import { postRepository } from "@/repositories/PostRepository";
import { Prisma } from "@prisma/client";

/**
 * [DEV] STRICT TYPES FOR POSTS
 */
type PostWithAuthor = Prisma.PostGetPayload<{
  include: { author: { select: { id: true, name: true, companyId: true } } };
}>;

type PostWithAuthorAndReplies = Prisma.PostGetPayload<{
  include: {
    author: { select: { id: true, name: true, companyId: true } };
    replies: {
      include: { author: { select: { id: true, name: true } } };
    };
  };
}>;

/**
 *  POST CRUD SERVICE
 *
 * Business logic for internal posts/feed.
 * [SEC] All queries scoped by author.companyId for multi-tenant isolation.
 */

export const postService = {
  async findAll(companyId: string) {
    return await postRepository.findMany({
      where: {
        author: { companyId },
      },
      include: {
        author: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async findOne(companyId: string, id: string) {
    const post = (await postRepository.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, companyId: true } },
        replies: {
          include: { author: { select: { id: true, name: true } } },
        },
      },
    })) as PostWithAuthorAndReplies | null;

    // Verify post belongs to company
    if (post && post.author.companyId !== companyId) return null;
    return post;
  },

  async create(_companyId: string, authorId: string, content: string) {
    // Verify user belongs to this company (defense in depth)
    return await postRepository.create({
      data: { content, authorId },
    });
  },

  async update(companyId: string, id: string, userId: string, content: string) {
    const post = (await postRepository.findUnique({
      where: { id },
      include: { author: { select: { id: true, name: true, companyId: true } } },
    })) as PostWithAuthor | null;

    if (!post) {
      throw new AppError("No se encontró ningún post con ese ID", 404);
    }

    // [SEC] Multi-tenant + ownership check
    if (post.author.companyId !== companyId) {
      throw new AppError("Post not found", 404);
    }

    if (post.authorId !== userId) {
      throw new AppError("No tienes permiso para editar este post.", 403);
    }

    return await postRepository.update({
      where: { id },
      data: { content },
    });
  },

  async delete(companyId: string, id: string, userId: string) {
    const post = (await postRepository.findUnique({
      where: { id },
      include: { author: { select: { id: true, name: true, companyId: true } } },
    })) as PostWithAuthor | null;

    if (!post) {
      throw new AppError("No se encontró ningún post con ese ID", 404);
    }

    // [SEC] Multi-tenant + ownership check
    if (post.author.companyId !== companyId) {
      throw new AppError("Post not found", 404);
    }

    if (post.authorId !== userId) {
      throw new AppError("No tienes permiso para eliminar este post.", 403);
    }

    await postRepository.delete({ where: { id } });
  },
};

