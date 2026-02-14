import { Company } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class CompanyRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findById(id: string): Promise<Company | null> {
    return this.db.company.findUnique({ where: { id } });
  }

  async findBySlug(slug: string): Promise<Company | null> {
    return this.db.company.findUnique({ where: { slug } });
  }
}

export const companyRepository = new CompanyRepository();
