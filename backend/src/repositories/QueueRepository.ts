import { Prisma, Queue } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";
import TenantContextManager from "@/config/tenantContext";
import { BaseRepository } from "./BaseRepository";

export class QueueRepository extends BaseRepository {
  constructor(db: ExtendedPrismaClient = prisma) {
    super(db);
  }

  async findMany(args: Prisma.QueueFindManyArgs, companyId?: string): Promise<Queue[]> {
    return this.db.queue.findMany(this.applyTenantFilter(args, companyId));
  }

  async findFirst(args: Prisma.QueueFindFirstArgs, companyId?: string): Promise<Queue | null> {
    return this.db.queue.findFirst(this.applyTenantFilter(args, companyId));
  }

  async create(args: Prisma.QueueCreateArgs, companyIdOverride?: string): Promise<Queue> {
    const companyId = companyIdOverride || TenantContextManager.getCompanyId();
    const data = { 
      ...args.data, 
      company: { connect: { id: companyId } } 
    } as Prisma.QueueCreateInput;
    return this.db.queue.create({ ...args, data });
  }

  async update(args: Prisma.QueueUpdateArgs, companyId?: string): Promise<Queue> {
    return this.db.queue.update(this.applyTenantFilter(args, companyId));
  }

  async delete(id: string, companyIdOverride?: string): Promise<Queue> {
    const companyId = companyIdOverride || TenantContextManager.getCompanyId();
    // [SEC] Verify ownership before delete
    const exists = await this.findUnique({ where: { id } }, companyId);
    if (!exists) throw new Error(`Queue ${id} not found in current company scope`);
    return this.db.queue.delete({ where: { id } });
  }

  async findUnique(args: Prisma.QueueFindUniqueArgs, companyId?: string): Promise<Queue | null> {
    return this.db.queue.findFirst(this.applyTenantFilter(args, companyId));
  }
}

export const queueRepository = new QueueRepository();
