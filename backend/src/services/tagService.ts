import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { tagRepository } from "@/repositories/TagRepository";
import { contactRepository } from "@/repositories/ContactRepository";

/**
 * 🏷️ TAG CRUD SERVICE
 *
 * Data access layer for tags management.
 */

export const tagService = {
  async findAll(companyId: string) {
    const tags = await tagRepository.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
    });

    // Calculate count of contacts for each tag
    const tagsWithCounts = await Promise.all(
      tags.map(async (tag) => {
        const count = await contactRepository.count({
          companyId,
          tags: { has: tag.name },
        });
        return { ...tag, count };
      }),
    );

    return tagsWithCounts;
  },

  async create(companyId: string, name: string, color?: string) {
    try {
      return await tagRepository.create({
        data: { name, color, companyId },
      });
    } catch (error: unknown) {
      const prismaError = error as { code?: string };
      if (prismaError.code === "P2002") {
        throw new AppError("La etiqueta ya existe", 400);
      }
      Logger.error("[TagService] Error creating tag:", error);
      throw new AppError("Failed to create tag", 500);
    }
  },

  async delete(id: string, companyId: string) {
    const result = await tagRepository.deleteMany({
      where: { id, companyId },
    });

    if (result.count === 0) {
      throw new AppError("Tag not found or permission denied", 404);
    }
  },
};
