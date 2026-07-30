import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class WorkflowExecutionRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async create(args: Prisma.WorkflowExecutionCreateArgs) {
    return this.db.workflowExecution.create(args);
  }

  async update(args: Prisma.WorkflowExecutionUpdateArgs) {
    return this.db.workflowExecution.update(args);
  }

  async findById(id: string) {
    return this.db.workflowExecution.findUnique({ where: { id } });
  }
}

export const workflowExecutionRepository = new WorkflowExecutionRepository();
