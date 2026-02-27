import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class AccountRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findMany(args: Prisma.AccountFindManyArgs) {
    return this.db.account.findMany(args);
  }

  async findFirst(args: Prisma.AccountFindFirstArgs) {
    return this.db.account.findFirst(args);
  }

  async create(args: Prisma.AccountCreateArgs) {
    return this.db.account.create(args);
  }

  async update(args: Prisma.AccountUpdateArgs) {
    return this.db.account.update(args);
  }

  async delete(id: string) {
    return this.db.account.delete({ where: { id } });
  }
}

export const accountRepository = new AccountRepository();
