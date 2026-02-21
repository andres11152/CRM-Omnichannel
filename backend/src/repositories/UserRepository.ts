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

  async findByEmail(email: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { email } });
  }

  async findUnique(args: Prisma.UserFindUniqueArgs) {
    return this.db.user.findUnique(args);
  }

  async findFirst(args: Prisma.UserFindFirstArgs) {
    return this.db.user.findFirst(args);
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
}

export const userRepository = new UserRepository();
