import { AppError } from "@/utils/AppError";
import { quickReplyRepository } from "@/repositories/QuickReplyRepository";

/**
 * ⚡ QUICK REPLY CRUD SERVICE
 *
 * Data access layer for Quick Replies (canned response templates).
 */

export const quickReplyService = {
  async findAll(companyId: string) {
    return await quickReplyRepository.findMany({
      where: { companyId },
      orderBy: { title: "asc" },
    });
  },

  async create(
    companyId: string,
    data: { title: string; content: string; category?: string },
  ) {
    return await quickReplyRepository.create({
      data: {
        companyId,
        title: data.title,
        content: data.content,
        category: data.category,
      },
    });
  },

  async update(
    id: string,
    companyId: string,
    data: { title?: string; content?: string; category?: string },
  ) {
    const reply = await quickReplyRepository.findUnique(id);

    if (!reply || reply.companyId !== companyId) {
      throw new AppError("Quick reply not found", 404);
    }

    return await quickReplyRepository.update({
      where: { id },
      data: {
        title: data.title,
        content: data.content,
        category: data.category,
      },
    });
  },

  async delete(id: string, companyId: string) {
    const reply = await quickReplyRepository.findUnique(id);

    if (!reply || reply.companyId !== companyId) {
      throw new AppError("Quick reply not found", 404);
    }

    await quickReplyRepository.delete(id);
  },
};
