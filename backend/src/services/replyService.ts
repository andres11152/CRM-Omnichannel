import { replyRepository } from "@/repositories/ReplyRepository";
import { AppError } from "@/utils/AppError";

/**
 * 💬 REPLY CRUD SERVICE
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
      throw new AppError("No se encontró ninguna respuesta con ese ID", 404);
    if (reply.authorId !== userId)
      throw new AppError("No tienes permiso para editar esta respuesta.", 403);
    return await replyRepository.update(id, content);
  },

  async delete(id: string, userId: string, companyId: string) {
    const reply = await replyRepository.findFirst(id, companyId);
    if (!reply)
      throw new AppError("No se encontró ninguna respuesta con ese ID", 404);
    if (reply.authorId !== userId)
      throw new AppError(
        "No tienes permiso para eliminar esta respuesta.",
        403,
      );
    await replyRepository.delete(id);
  },
};
