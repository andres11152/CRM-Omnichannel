import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class DealProductRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findMany(args: Prisma.DealProductFindManyArgs) {
    return this.db.dealProduct.findMany(args);
  }

  async findFirst(args: Prisma.DealProductFindFirstArgs) {
    return this.db.dealProduct.findFirst(args);
  }

  async create(args: Prisma.DealProductCreateArgs) {
    return this.db.dealProduct.create(args);
  }

  async update(args: Prisma.DealProductUpdateArgs) {
    return this.db.dealProduct.update(args);
  }

  async delete(id: string) {
    return this.db.dealProduct.delete({ where: { id } });
  }

  async deleteMany(args: Prisma.DealProductDeleteManyArgs) {
    return this.db.dealProduct.deleteMany(args);
  }
}

export const dealProductRepository = new DealProductRepository();
