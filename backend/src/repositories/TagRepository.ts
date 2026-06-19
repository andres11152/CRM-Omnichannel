import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class TagRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findMany(args: Prisma.TagFindManyArgs) {
    return this.db.tag.findMany(args);
  }

  async create(args: Prisma.TagCreateArgs) {
    return this.db.tag.create(args);
  }

  async deleteMany(args: Prisma.TagDeleteManyArgs) {
    return this.db.tag.deleteMany(args);
  }

  async update(companyId: string, id: string, data: Prisma.TagUpdateInput) {
    return this.db.tag.update({
      where: { id, companyId },
      data,
    });
  }
}

export const tagRepository = new TagRepository();
