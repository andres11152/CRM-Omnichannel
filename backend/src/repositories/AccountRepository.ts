import { Prisma, Account } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";
import { IAccountRepository } from "@/domain/repositories/IAccountRepository";
import { AccountEntity } from "@/domain/entities/Account";
import { CreateAccountDTO, UpdateAccountDTO, AccountSearchFilterDTO } from "@/domain/dtos/AccountDTOs";

export class AccountRepository implements IAccountRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  /**
   * MAPPER PRIVADO: Transforma Filtros de Dominio en Queries de Prisma
   */
  private mapToPrismaQuery(filters: AccountSearchFilterDTO): Prisma.AccountWhereInput {
    const where: Prisma.AccountWhereInput = {
      companyId: filters.companyId,
    };

    if (filters.name) {
      where.name = { contains: filters.name, mode: "insensitive" };
    }

    if (filters.status) {
      where.status = filters.status;
    }

    return where;
  }

  /**
   * MAPPER PRIVADO: Transforma Prisma Records en Entidades Puras
   */
  private mapToDomain(
    record: Account & { _count?: { contacts: number; deals: number } },
  ): AccountEntity {
    return {
      id: record.id,
      companyId: record.companyId,
      name: record.name,
      industry: record.industry,
      website: record.website,
      size: record.size,
      address: record.address,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      // Mapear aggregates si existen (vienen del select _count)
      contactCount: record._count?.contacts,
      dealCount: record._count?.deals,
    };
  }

  async findMany(filters: AccountSearchFilterDTO): Promise<AccountEntity[]> {
    const skip = filters.page && filters.limit ? (filters.page - 1) * filters.limit : undefined;
    const take = filters.limit;

    const include = filters.includeCounts ? {
      _count: {
        select: { contacts: true, deals: true }
      }
    } : undefined;

    const records = await this.db.account.findMany({
      where: this.mapToPrismaQuery(filters),
      include,
      skip,
      take,
      orderBy: { updatedAt: "desc" },
    });

    return records.map(this.mapToDomain);
  }

  async findById(
    id: string,
    companyId: string,
    includeDetails: boolean = false,
  ): Promise<AccountEntity | (Prisma.AccountGetPayload<{
    include: {
      contacts: true;
      deals: true;
      activities: {
        include: { createdBy: { select: { name: true; email: true } } };
      };
    };
  }>) | null> {
    const include = includeDetails ? {
        contacts: true,
        deals: true,
        activities: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { createdBy: { select: { name: true, email: true } } },
        },
    } : undefined;

    const record = await this.db.account.findFirst({
      where: { id, companyId },
      include: include as Prisma.AccountInclude
    });

    if (!record) return null;
    
    // Si incluye detalles, devolvemos el objeto extendido por ahora
    return includeDetails ? record : this.mapToDomain(record);
  }

  async create(companyId: string, data: CreateAccountDTO): Promise<AccountEntity> {
    const record = await this.db.account.create({
      data: {
        companyId,
        name: data.name,
        industry: data.industry,
        website: data.website,
        size: data.size,
        address: data.address,
        status: data.status || "ACTIVE",
      },
    });
    return this.mapToDomain(record);
  }

  async update(id: string, companyId: string, data: UpdateAccountDTO): Promise<AccountEntity> {
    const record = await this.db.account.update({
      where: { id },
      data,
    });
    return this.mapToDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.db.account.delete({ where: { id } });
  }
}

export const accountRepository = new AccountRepository();
