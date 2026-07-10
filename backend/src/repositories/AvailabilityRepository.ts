import { Prisma, Availability } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";
import { BaseRepository } from "./BaseRepository";

export class AvailabilityRepository extends BaseRepository {
  constructor(db: ExtendedPrismaClient = prisma) {
    super(db);
  }

  async findFirst(args: Prisma.AvailabilityFindFirstArgs, companyId?: string): Promise<Availability | null> {
    return this.db.availability.findFirst(this.applyTenantFilter(args, companyId));
  }

  async findUnique(args: Prisma.AvailabilityFindUniqueArgs, companyId?: string): Promise<Availability | null> {
    return this.db.availability.findFirst(this.applyTenantFilter(args, companyId));
  }

  async create(args: Prisma.AvailabilityCreateArgs, companyIdOverride?: string): Promise<Availability> {
    const companyId = companyIdOverride || this.scopeWhere({}).companyId as string;
    const data = {
      ...args.data,
      company: { connect: { id: companyId } },
    } as Prisma.AvailabilityCreateInput;
    return this.db.availability.create({ ...args, data });
  }

  async update(args: Prisma.AvailabilityUpdateArgs, companyId?: string): Promise<Availability> {
    return this.db.availability.update(this.applyTenantFilter(args, companyId));
  }

  async upsert(
    userId: string,
    companyId: string,
    timezone: string,
    rules: Prisma.InputJsonValue
  ): Promise<Availability> {
    return this.db.availability.upsert({
      where: { userId },
      create: {
        userId,
        companyId,
        timezone,
        rules,
      },
      update: {
        timezone,
        rules,
      },
    });
  }
}

export const availabilityRepository = new AvailabilityRepository();
