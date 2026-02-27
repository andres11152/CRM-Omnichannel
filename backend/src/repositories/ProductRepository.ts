import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class ProductRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findMany(args: Prisma.ProductFindManyArgs) {
    return this.db.product.findMany(args);
  }

  async findFirst(args: Prisma.ProductFindFirstArgs) {
    return this.db.product.findFirst(args);
  }

  async create(args: Prisma.ProductCreateArgs) {
    return this.db.product.create(args);
  }

  async update(args: Prisma.ProductUpdateArgs) {
    return this.db.product.update(args);
  }

  async delete(id: string) {
    return this.db.product.delete({ where: { id } });
  }
}

export const productRepository = new ProductRepository();
