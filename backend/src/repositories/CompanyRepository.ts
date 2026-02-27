import { Company, Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class CompanyRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findById(id: string): Promise<Company | null> {
    return this.db.company.findUnique({ where: { id } });
  }

  async findBySlug(slug: string): Promise<Company | null> {
    return this.db.company.findUnique({ where: { slug } });
  }

  async findUnique(args: Prisma.CompanyFindUniqueArgs) {
    return this.db.company.findUnique(args);
  }

  async update(id: string, data: Record<string, unknown>) {
    return this.db.company.update({ where: { id }, data });
  }

  async updateRaw(args: Prisma.CompanyUpdateArgs) {
    return this.db.company.update(args);
  }
  async findMany(args: Prisma.CompanyFindManyArgs) {
    return this.db.company.findMany(args);
  }

  async create(args: Prisma.CompanyCreateArgs) {
    return this.db.company.create(args);
  }
}

export const companyRepository = new CompanyRepository();
