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

  async upsertShadowUser(params: ShadowUserParams): Promise<User> {
    const { email, name, phone, companyId, password, preferences } = params;

    // We check existence logic inside service or here?
    // Service passed explicit logic. Repository should handle the DB op.
    // Logic: upsert.

    return this.db.user.upsert({
      where: { email },
      update: {
        // If name implies generic, we update it. But repository shouldn't judge "generic".
        // Service handles "decision" to update name.
        // BUT upsert in Prisma requires 'update' payload.
        // If we want conditional update, we might need separate operations or pass "updateData".
        // For simplicity and 100% adherence to Service logic:
        // Service should pass { name } to update if needed.
        // I will make params fully detailed.
        name: name, // This overwrites always? The service logic check "if generic".
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

  // Refined: upsertWithConditionalUpdate
  async upsert(
    where: Prisma.UserWhereUniqueInput,
    create: Prisma.UserCreateInput,
    update: Prisma.UserUpdateInput,
  ): Promise<User> {
    return this.db.user.upsert({ where, create, update });
  }
}
