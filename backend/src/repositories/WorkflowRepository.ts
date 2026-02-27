import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class WorkflowRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findMany(args: Prisma.WorkflowFindManyArgs) {
    return this.db.workflow.findMany(args);
  }

  async findFirst(args: Prisma.WorkflowFindFirstArgs) {
    return this.db.workflow.findFirst(args);
  }

  async findUnique(id: string) {
    return this.db.workflow.findUnique({ where: { id } });
  }

  async create(args: Prisma.WorkflowCreateArgs) {
    return this.db.workflow.create(args);
  }

  async update(args: Prisma.WorkflowUpdateArgs) {
    return this.db.workflow.update(args);
  }

  async delete(id: string) {
    return this.db.workflow.delete({ where: { id } });
  }
}

export const workflowRepository = new WorkflowRepository();
