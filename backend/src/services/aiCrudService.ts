import { aiConfigRepository } from "@/repositories/AiConfigRepository";
import { aiAssistantRepository } from "@/repositories/AIAssistantRepository";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";

/**
 * [AI] AI CRUD SERVICE
 *
 * Data access layer for AI Config (API keys) and AI Assistants (personas).
 */

export const aiCrudService = {
  // --- AI CONFIG ---

  async getConfig(companyId: string) {
    const config = await aiConfigRepository.findUnique({
      where: { companyId },
    });

    // Mask keys for security
    if (config) {
      config.openaiKey = config.openaiKey
        ? `${config.openaiKey.substring(0, 3)}...${config.openaiKey.slice(-4)}`
        : null;
      config.geminiKey = config.geminiKey
        ? `${config.geminiKey.substring(0, 3)}...${config.geminiKey.slice(-4)}`
        : null;
    }

    return config;
  },

  async upsertConfig(
    companyId: string,
    data: { openaiKey?: string; geminiKey?: string },
  ) {
    await aiConfigRepository.upsert({
      where: { companyId },
      update: {
        openaiKey: data.openaiKey === "" ? null : data.openaiKey || undefined,
        geminiKey: data.geminiKey === "" ? null : data.geminiKey || undefined,
      },
      create: {
        companyId,
        openaiKey: data.openaiKey || null,
        geminiKey: data.geminiKey || null,
      },
    });

    Logger.info(`[AI] Config updated for company ${companyId}`);
  },

  // --- AI ASSISTANTS ---

  async findAllAssistants(companyId: string) {
    return await aiAssistantRepository.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { queues: true } },
      },
    });
  },

  async createAssistant(
    companyId: string,
    data: {
      name: string;
      description?: string;
      modelProvider?: string;
      modelName?: string;
      systemPrompt?: string;
      temperature?: number;
    },
  ) {
    const assistant = await aiAssistantRepository.create({
      data: {
        companyId,
        name: data.name,
        description: data.description,
        modelProvider: data.modelProvider,
        modelName: data.modelName,
        systemPrompt: data.systemPrompt,
        temperature: data.temperature || 0.7,
      },
    });

    Logger.info(`[AI] Assistant created: ${assistant.name} (${assistant.id})`);
    return assistant;
  },

  async updateAssistant(
    id: string,
    companyId: string,
    data: Record<string, unknown>,
  ) {
    const existing = await aiAssistantRepository.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new AppError("Assistant not found", 404);
    }

    return await aiAssistantRepository.update({
      where: { id },
      data: {
        name: data.name as string | undefined,
        description: data.description as string | undefined,
        modelProvider: data.modelProvider as string | undefined,
        modelName: data.modelName as string | undefined,
        systemPrompt: data.systemPrompt as string | undefined,
        temperature: data.temperature as number | undefined,
      },
    });
  },

  async deleteAssistant(id: string, companyId: string) {
    const existing = await aiAssistantRepository.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new AppError("Assistant not found", 404);
    }

    await aiAssistantRepository.delete({ where: { id } });
    Logger.info(`[AI] Assistant deleted: ${existing.name} (${id})`);
  },
};
