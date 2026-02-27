import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class AgentSessionRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async create(args: Prisma.AgentSessionCreateArgs) {
    return this.db.agentSession.create(args);
  }

  async findFirst(args: Prisma.AgentSessionFindFirstArgs) {
    return this.db.agentSession.findFirst(args);
  }

  async update(args: Prisma.AgentSessionUpdateArgs) {
    return this.db.agentSession.update(args);
  }

  async updateMany(args: Prisma.AgentSessionUpdateManyArgs) {
    return this.db.agentSession.updateMany(args);
  }
}

export const agentSessionRepository = new AgentSessionRepository();
