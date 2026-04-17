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

  async findUnique(id: string, companyId: string) {
    return this.db.workflow.findFirst({ where: { id, companyId } });
  }

  async create(args: Prisma.WorkflowCreateArgs) {
    return this.db.workflow.create(args);
  }

  async update(args: Prisma.WorkflowUpdateArgs) {
    return this.db.workflow.update(args);
  }

  async delete(id: string, companyId: string) {
    // [SEC] Verify ownership before delete
    const exists = await this.db.workflow.findFirst({ where: { id, companyId } });
    if (!exists) throw new Error(`Workflow ${id} not found in company ${companyId}`);
    return this.db.workflow.delete({ where: { id } });
  }
}

export const workflowRepository = new WorkflowRepository();
