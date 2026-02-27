import { Activity, Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class ActivityRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findMany(args: Prisma.ActivityFindManyArgs) {
    return this.db.activity.findMany(args);
  }

  async findFirst(args: Prisma.ActivityFindFirstArgs) {
    return this.db.activity.findFirst(args);
  }

  async create(args: Prisma.ActivityCreateArgs) {
    return this.db.activity.create(args);
  }

  async update(args: Prisma.ActivityUpdateArgs) {
    return this.db.activity.update(args);
  }

  async delete(id: string): Promise<Activity> {
    return this.db.activity.delete({ where: { id } });
  }

  async updateMany(args: Prisma.ActivityUpdateManyArgs) {
    return this.db.activity.updateMany(args);
  }
}

export const activityRepository = new ActivityRepository();
