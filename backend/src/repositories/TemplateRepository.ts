import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class TemplateRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findMany(args: Prisma.MessageTemplateFindManyArgs) {
    return this.db.messageTemplate.findMany(args);
  }

  async findFirst(args: Prisma.MessageTemplateFindFirstArgs) {
    return this.db.messageTemplate.findFirst(args);
  }

  async create(args: Prisma.MessageTemplateCreateArgs) {
    return this.db.messageTemplate.create(args);
  }

  async createMany(args: Prisma.MessageTemplateCreateManyArgs) {
    return this.db.messageTemplate.createMany(args);
  }

  async update(args: Prisma.MessageTemplateUpdateArgs) {
    return this.db.messageTemplate.update(args);
  }

  async delete(id: string) {
    return this.db.messageTemplate.delete({ where: { id } });
  }
}

export const templateRepository = new TemplateRepository();
