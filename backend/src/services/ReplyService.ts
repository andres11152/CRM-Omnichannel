import { replyRepository } from "@/repositories/ReplyRepository";
import { AppError } from "@/utils/AppError";

/**
 * [CHAT] REPLY CRUD SERVICE
 */
export const replyService = {
  async findByPost(postId: string, companyId: string) {
    return await replyRepository.findByPostId(postId, companyId);
  },

  async create(authorId: string, postId: string, content: string) {
    return await replyRepository.create(authorId, postId, content);
  },

  async update(id: string, userId: string, companyId: string, content: string) {
    const reply = await replyRepository.findFirst(id, companyId);
    if (!reply)
      throw new AppError("Reply not found", 404);
    if (reply.authorId !== userId)
      throw new AppError("Permission denied to edit this reply", 403);
    return await replyRepository.update(id, content);
  },

  async delete(id: string, userId: string, companyId: string) {
    const reply = await replyRepository.findFirst(id, companyId);
    if (!reply)
      throw new AppError("Reply not found", 404);
    if (reply.authorId !== userId)
      throw new AppError(
        "Permission denied to delete this reply",
        403,
      );
    await replyRepository.delete(id);
  },
};
