import { prisma, ExtendedPrismaClient } from "@/config/database";
import { Prisma } from "@prisma/client";

export class StatsRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async countUsers(args: Prisma.UserCountArgs) {
    return this.db.user.count(args);
  }

  async countWhatsAppSessions(args: Prisma.WhatsAppSessionCountArgs) {
    return this.db.whatsAppSession.count(args);
  }

  async countQueues(args: Prisma.QueueCountArgs) {
    return this.db.queue.count(args);
  }

  async countTickets(args: Prisma.TicketCountArgs) {
    return this.db.ticket.count(args);
  }

  async countAIAssistants(args: Prisma.AIAssistantCountArgs) {
    return this.db.aIAssistant.count(args);
  }

  async sumMediaSize(companyId: string): Promise<number> {
    const agg = await this.db.media.aggregate({
      where: { companyId },
      _sum: { size: true },
    });
    return agg._sum.size || 0;
  }

  async countContacts(args: Prisma.ContactCountArgs) {
    return this.db.contact.count(args);
  }

  async countAccounts(args: Prisma.AccountCountArgs) {
    return this.db.account.count(args);
  }

  async countWorkflows(args: Prisma.WorkflowCountArgs) {
    return this.db.workflow.count(args);
  }
  async checkDatabaseStatus(): Promise<boolean> {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

export const statsRepository = new StatsRepository();
