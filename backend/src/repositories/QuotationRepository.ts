import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class QuotationRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findMany(args: Prisma.QuotationFindManyArgs) {
    return this.db.quotation.findMany(args);
  }

  async findFirst(args: Prisma.QuotationFindFirstArgs) {
    return this.db.quotation.findFirst(args);
  }

  async findUnique(args: Prisma.QuotationFindUniqueArgs) {
    return this.db.quotation.findUnique(args);
  }

  async create(args: Prisma.QuotationCreateArgs) {
    return this.db.quotation.create(args);
  }

  async update(args: Prisma.QuotationUpdateArgs) {
    return this.db.quotation.update(args);
  }

  async delete(id: string) {
    return this.db.quotation.delete({ where: { id } });
  }

  async count(args: Prisma.QuotationCountArgs) {
    return this.db.quotation.count(args);
  }

  async getNextQuoteNumber(companyId: string): Promise<number> {
    const maxQuote = await this.db.quotation.findFirst({
      where: { companyId },
      orderBy: { quoteNumber: "desc" },
      select: { quoteNumber: true },
    });
    return (maxQuote?.quoteNumber || 0) + 1;
  }
}

export const quotationRepository = new QuotationRepository();
