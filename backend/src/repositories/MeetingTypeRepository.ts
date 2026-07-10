import { Prisma, MeetingType } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";
import { BaseRepository } from "./BaseRepository";

export class MeetingTypeRepository extends BaseRepository {
  constructor(db: ExtendedPrismaClient = prisma) {
    super(db);
  }

  async findMany(args: Prisma.MeetingTypeFindManyArgs, companyId?: string): Promise<MeetingType[]> {
    return this.db.meetingType.findMany(this.applyTenantFilter(args, companyId));
  }

  async findFirst(args: Prisma.MeetingTypeFindFirstArgs, companyId?: string): Promise<MeetingType | null> {
    return this.db.meetingType.findFirst(this.applyTenantFilter(args, companyId));
  }

  async findUnique(args: Prisma.MeetingTypeFindUniqueArgs, companyId?: string): Promise<MeetingType | null> {
    return this.db.meetingType.findFirst(this.applyTenantFilter(args, companyId));
  }

  async create(args: Prisma.MeetingTypeCreateArgs, companyIdOverride?: string): Promise<MeetingType> {
    const companyId = companyIdOverride || this.scopeWhere({}).companyId as string;
    const data = {
      ...args.data,
      company: { connect: { id: companyId } },
    } as Prisma.MeetingTypeCreateInput;
    return this.db.meetingType.create({ ...args, data });
  }

  async update(args: Prisma.MeetingTypeUpdateArgs, companyId?: string): Promise<MeetingType> {
    return this.db.meetingType.update(this.applyTenantFilter(args, companyId));
  }

  async delete(id: string, companyId?: string): Promise<MeetingType> {
    const where = this.scopeWhere({ id }, companyId);
    return this.db.meetingType.delete({
      where: { id: where.id as string },
    });
  }
}

export const meetingTypeRepository = new MeetingTypeRepository();
