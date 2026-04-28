import { User, Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";
import TenantContextManager from "@/config/tenantContext";
import { BaseRepository } from "./BaseRepository";

export interface ShadowUserParams {
  email: string;
  name: string;
  phone: string;
  companyId: string;
  password?: string;
  preferences?: Prisma.InputJsonValue;
}

export class UserRepository extends BaseRepository {
  constructor(db: ExtendedPrismaClient = prisma) {
    super(db);
  }

  async findById(id: string, companyId?: string): Promise<User | null> {
    return this.db.user.findFirst(this.applyTenantFilter({ where: { id } }, companyId));
  }

  async findUnique(args: Prisma.UserFindUniqueArgs, companyId?: string): Promise<User | null> {
    return this.db.user.findFirst(this.applyTenantFilter(args, companyId));
  }

  async findFirst(args: Prisma.UserFindFirstArgs, companyId?: string): Promise<User | null> {
    return this.db.user.findFirst(this.applyTenantFilter(args, companyId));
  }

  async findMany(args: Prisma.UserFindManyArgs, companyId?: string): Promise<User[]> {
    return this.db.user.findMany(this.applyTenantFilter(args, companyId));
  }

  async findByEmail(email: string): Promise<User | null> {
    // [SEC] Used for login/auth, bypasses tenant check initially
    return this.db.user.findFirst({ where: { email } });
  }

  async create(args: Prisma.UserCreateArgs, companyIdOverride?: string): Promise<User> {
    const companyId = companyIdOverride || TenantContextManager.getCompanyId();
    // [SEC] Strip scalar companyId to avoid collision with relation connect
    const { companyId: _stripScalar, ...restData } = args.data as Record<string, unknown>;
    const data = {
      ...restData,
      company: { connect: { id: companyId } },
    } as Prisma.UserCreateInput;
    return this.db.user.create({ ...args, data });
  }

  async update(id: string, companyId: string, data: Prisma.UserUpdateInput, include?: Prisma.UserInclude): Promise<User> {
    return this.db.user.update({
      where: { id, companyId },
      data,
      include,
    });
  }

  async count(args: Prisma.UserCountArgs, companyId?: string): Promise<number> {
    return this.db.user.count(this.applyTenantFilter(args, companyId));
  }

  async delete(id: string, companyId: string): Promise<User> {
    return this.db.user.delete({
      where: { id, companyId },
    });
  }

  async upsert(args: Prisma.UserUpsertArgs): Promise<User> {
    return this.db.user.upsert(args);
  }

  async upsertShadowUser(params: ShadowUserParams): Promise<User> {
    const { email, name, phone, companyId, password, preferences } = params;
    return this.db.user.upsert({
      where: { email },
      update: {
        name,
        phone,
        companyId,
        preferences: preferences as Prisma.InputJsonValue,
      },
      create: {
        email,
        name,
        phone,
        companyId,
        password: password || "",
        role: "AGENT",
        preferences: preferences as Prisma.InputJsonValue,
      },
    });
  }
}

export const userRepository = new UserRepository();
