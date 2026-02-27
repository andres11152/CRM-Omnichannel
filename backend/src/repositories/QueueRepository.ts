import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class QueueRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findMany(args: Prisma.QueueFindManyArgs) {
    return this.db.queue.findMany(args);
  }

  async findFirst(args: Prisma.QueueFindFirstArgs) {
    return this.db.queue.findFirst(args);
  }

  async create(args: Prisma.QueueCreateArgs) {
    return this.db.queue.create(args);
  }

  async update(args: Prisma.QueueUpdateArgs) {
    return this.db.queue.update(args);
  }

  async delete(id: string) {
    return this.db.queue.delete({ where: { id } });
  }
  async findUnique(args: Prisma.QueueFindUniqueArgs) {
    return this.db.queue.findUnique(args);
  }
}

export const queueRepository = new QueueRepository();
