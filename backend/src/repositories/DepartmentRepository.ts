import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class DepartmentRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findMany(args: Prisma.DepartmentFindManyArgs) {
    return this.db.department.findMany(args);
  }

  async findFirst(args: Prisma.DepartmentFindFirstArgs) {
    return this.db.department.findFirst(args);
  }

  async create(args: Prisma.DepartmentCreateArgs) {
    return this.db.department.create(args);
  }

  async update(args: Prisma.DepartmentUpdateArgs) {
    return this.db.department.update(args);
  }

  async delete(id: string) {
    return this.db.department.delete({ where: { id } });
  }
}

export const departmentRepository = new DepartmentRepository();
