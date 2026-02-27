import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class QuickReplyRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findMany(args: Prisma.QuickReplyFindManyArgs) {
    return this.db.quickReply.findMany(args);
  }

  async findUnique(id: string) {
    return this.db.quickReply.findUnique({ where: { id } });
  }

  async create(args: Prisma.QuickReplyCreateArgs) {
    return this.db.quickReply.create(args);
  }

  async update(args: Prisma.QuickReplyUpdateArgs) {
    return this.db.quickReply.update(args);
  }

  async delete(id: string) {
    return this.db.quickReply.delete({ where: { id } });
  }
}

export const quickReplyRepository = new QuickReplyRepository();
