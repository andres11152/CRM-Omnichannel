import { User, Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export interface ShadowUserParams {
  email: string;
  name: string;
  phone: string;
  companyId: string;
  password?: string;
  preferences?: Prisma.InputJsonValue;
}

export class UserRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findById(id: string, companyId: string): Promise<User | null> {
    return this.db.user.findFirst({
      where: { id, companyId },
    });
  }

  async findFirst(args: Prisma.UserFindFirstArgs) {
    return this.db.user.findFirst(args);
  }

  async findUnique(args: Prisma.UserFindUniqueArgs) {
    return this.db.user.findUnique(args);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { email } });
  }

  async findMany(args: Prisma.UserFindManyArgs) {
    return this.db.user.findMany(args);
  }

  async upsertShadowUser(params: ShadowUserParams): Promise<User> {
    const { email, name, phone, companyId, password, preferences } = params;

    return this.db.user.upsert({
      where: { email },
      update: {
        name: name,
      },
      create: {
        email,
        name,
        password: password || "",
        role: "USER",
        companyId,
        phone,
        preferences: preferences || {},
      },
    });
  }

  async upsert(
    where: Prisma.UserWhereUniqueInput,
    create: Prisma.UserCreateInput,
    update: Prisma.UserUpdateInput,
  ): Promise<User> {
    return this.db.user.upsert({ where, create, update });
  }

  async update<T = User>(
    id: string,
    companyId: string,
    data: Prisma.UserUpdateInput | Prisma.UserUncheckedUpdateInput,
    include?: Prisma.UserInclude
  ): Promise<T> {
    const user = await this.findById(id, companyId);
    if (!user) throw new Error(`User ${id} not found in company ${companyId}`);

    const result = await (this.db.user as Prisma.UserDelegate).update({
      where: { id },
      data,
      include,
    });
    return result as T;
  }

  async create(args: Prisma.UserCreateArgs): Promise<User> {
    return this.db.user.create(args);
  }

  async count(where: Prisma.UserWhereInput): Promise<number> {
    return this.db.user.count({ where });
  }

  async delete(id: string, companyId: string): Promise<User> {
    const user = await this.findById(id, companyId);
    if (!user) throw new Error(`User ${id} not found in company ${companyId}`);

    return this.db.user.delete({ where: { id } });
  }
}

export const userRepository = new UserRepository();
