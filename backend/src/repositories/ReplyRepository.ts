import { prisma } from "@/config/database";

export const replyRepository = {
  findByPostId(postId: string, companyId: string) {
    return prisma.reply.findMany({
      where: { postId, post: { author: { companyId } } },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
  },

  create(authorId: string, postId: string, content: string) {
    return prisma.reply.create({ data: { content, authorId, postId } });
  },

  findFirst(id: string, companyId: string) {
    return prisma.reply.findFirst({
      where: { id, post: { author: { companyId } } },
    });
  },

  update(id: string, content: string) {
    return prisma.reply.update({ where: { id }, data: { content } });
  },

  delete(id: string) {
    return prisma.reply.delete({ where: { id } });
  },
};
