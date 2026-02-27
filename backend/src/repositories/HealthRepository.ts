import { prisma } from "@/config/database";

class HealthRepository {
  async checkDatabaseLiveness(): Promise<void> {
    await prisma.$queryRaw`SELECT 1`;
  }
}

export const healthRepository = new HealthRepository();
