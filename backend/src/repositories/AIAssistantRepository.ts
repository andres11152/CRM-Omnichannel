import { prisma, ExtendedPrismaClient } from "@/config/database";
import { AIAssistant, Prisma } from "@prisma/client";

/**
 * [AI] AI ASSISTANT REPOSITORY
 *
 * Handles all database operations for the AIAssistant model.
 * Used by AITriggerService to fetch assistant configuration.
 */
export class AIAssistantRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findUnique(args: Prisma.AIAssistantFindUniqueArgs) {
    return this.db.aIAssistant.findUnique(args);
  }

  async findById(
    id: string,
    select?: Prisma.AIAssistantSelect,
  ): Promise<Partial<AIAssistant> | null> {
    return this.db.aIAssistant.findUnique({
      where: { id },
      select,
    });
  }

  async findMany(args: Prisma.AIAssistantFindManyArgs) {
    return this.db.aIAssistant.findMany(args);
  }

  async findFirst(args: Prisma.AIAssistantFindFirstArgs) {
    return this.db.aIAssistant.findFirst(args);
  }

  async create(args: Prisma.AIAssistantCreateArgs) {
    return this.db.aIAssistant.create(args);
  }

  async update(args: Prisma.AIAssistantUpdateArgs) {
    return this.db.aIAssistant.update(args);
  }

  async delete(args: Prisma.AIAssistantDeleteArgs) {
    return this.db.aIAssistant.delete(args);
  }
}

export const aiAssistantRepository = new AIAssistantRepository();
