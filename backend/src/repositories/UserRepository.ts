import { User, Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";
import TenantContextManager from "@/config/tenantContext";
import { BaseRepository } from "./BaseRepository";
import { runAsSystem } from "@/context/requestContext";

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
    // [SEC] Used for login/auth, bypasses tenant check initially via runAsSystem
    return runAsSystem(() => this.db.user.findFirst({ where: { email } }));
  }

  async create(args: Prisma.UserCreateArgs, companyIdOverride?: string): Promise<User> {
    const companyId = companyIdOverride || (TenantContextManager.hasContext() ? TenantContextManager.getCompanyId() : undefined);

    // If running as system or no context, but company creation/connection is explicitly provided, respect it
    if (companyId === "__SYSTEM__" || !companyId || (args.data as Prisma.UserCreateInput).company) {
      return this.db.user.create(args);
    }

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

  /**
   * [SYSTEM] Update a user by id WITHOUT a tenant (companyId) scope.
   * For system-level flows that legitimately target a single user regardless of tenant
   * (e.g. password-reset token generation, which also works for global users that have
   * no companyId). Caller MUST have already authorized the operation. Run inside
   * TenantContextManager.runAsSystem to bypass RLS.
   */
  async updateById(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return runAsSystem(() => this.db.user.update({ where: { id }, data }));
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

    const doUpsert = (targetEmail: string) =>
      this.db.user.upsert({
        where: { email: targetEmail },
        update: {
          name,
          phone,
          companyId,
          preferences: preferences as Prisma.InputJsonValue,
        },
        create: {
          email: targetEmail,
          name,
          phone,
          companyId,
          password: password || "",
          role: "AGENT",
          preferences: preferences as Prisma.InputJsonValue,
        },
      });

    try {
      return await doUpsert(email);
    } catch (error: unknown) {
      const isUnique =
        error instanceof Error &&
        error.message.includes("Unique constraint failed");
      if (!isUnique) throw error;

      // [SEC] 100-YEAR FIX (multi-tenant collision): shadow emails are
      // phone-derived but User.email is globally unique. If the same phone
      // already has a shadow user under ANOTHER company, the RLS-scoped
      // upsert always takes the CREATE branch and hits P2002 — manual chat
      // creation for that customer was impossible for the second tenant.
      // Fall back to this company's own row (legacy or scoped) or create a
      // company-scoped email (keeps the @whatsapp.user suffix lookups rely on).
      const [localPart, domain] = email.split("@");
      const scopedEmail = `${localPart}.${companyId}@${domain}`;
      const own = await this.db.user.findFirst({
        where: { email: { in: [email, scopedEmail] }, companyId },
      });
      if (own) {
        return this.db.user.update({
          where: { id: own.id },
          data: {
            name,
            phone,
            preferences: preferences as Prisma.InputJsonValue,
          },
        });
      }
      return doUpsert(scopedEmail);
    }
  }
}

export const userRepository = new UserRepository();
