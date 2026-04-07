import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { Prisma, Channel } from "@prisma/client";
import { templateRepository } from "@/repositories/TemplateRepository";

/**
 *  TEMPLATE CRUD SERVICE
 *
 * Data access layer for WhatsApp message templates.
 * Separated from templateService (rendering) for SRP compliance.
 */

interface TemplateFilters {
  category?: string;
  channel?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CreateTemplateDTO {
  name: string;
  category?: string;
  components?: Prisma.InputJsonValue;
  language?: string;
  channel?: string;
  subject?: string;
  status?: string;
}

export interface UpdateTemplateDTO {
  name?: string;
  category?: string;
  components?: Prisma.InputJsonValue;
  language?: string;
  subject?: string;
  status?: string;
}

export const templateCrudService = {
  async findAll(companyId: string, filters: TemplateFilters) {
    const where: Prisma.MessageTemplateWhereInput = { companyId };

    if (filters.category) where.category = filters.category;
    if (filters.channel) where.channel = filters.channel as Channel;
    if (filters.status) where.status = filters.status;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { subject: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    return await templateRepository.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters.limit || 50,
      skip: filters.offset || 0,
    });
  },

  async findOne(id: string, companyId: string) {
    return await templateRepository.findFirst({
      where: { id, companyId },
    });
  },

  async create(companyId: string, data: CreateTemplateDTO) {
    const existing = await templateRepository.findFirst({
      where: { companyId, name: data.name },
    });

    if (existing) {
      throw new AppError(
        `Template with name "${data.name}" already exists`,
        400,
      );
    }

    const template = await templateRepository.create({
      data: {
        companyId,
        name: data.name,
        category: data.category || "MARKETING",
        components: data.components || [],
        language: data.language || "es",
        channel: (data.channel as Channel) || "WHATSAPP",
        subject: data.subject || undefined,
        status: data.status || "approved",
      },
    });

    Logger.info(
      `[Template] Created new template: ${template.name} (${template.id})`,
    );

    return template;
  },

  async update(id: string, companyId: string, data: UpdateTemplateDTO) {
    const existing = await templateRepository.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new AppError("Template not found", 404);
    }

    if (data.name && data.name !== existing.name) {
      const duplicate = await templateRepository.findFirst({
        where: { companyId, name: data.name, id: { not: id } },
      });

      if (duplicate) {
        throw new AppError(
          `Template with name "${data.name}" already exists`,
          400,
        );
      }
    }

    const template = await templateRepository.update({
      where: { id },
      data: {
        name: data.name,
        category: data.category,
        components: data.components,
        language: data.language,
        subject: data.subject,
        status: data.status,
      },
    });

    Logger.info(
      `[Template] Updated template: ${template.name} (${template.id})`,
    );

    return template;
  },

  async delete(id: string, companyId: string) {
    const existing = await templateRepository.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new AppError("Template not found", 404);
    }

    await templateRepository.delete(id);

    Logger.info(`[Template] Deleted template: ${existing.name} (${id})`);
  },
};
