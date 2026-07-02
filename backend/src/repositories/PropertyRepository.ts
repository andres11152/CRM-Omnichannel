import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

/**
 * [REAL ESTATE] PROPERTY REPOSITORY
 *
 * Wrapper Prisma para inmuebles y su galería. El filtrado de soft-delete
 * (deletedAt: null) y el scoping por companyId viven en el service.
 */
export class PropertyRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  // Genéricos para preservar el tipo del `include`/`select` en el resultado.
  findMany<T extends Prisma.PropertyFindManyArgs>(
    args: T,
  ): Promise<Array<Prisma.PropertyGetPayload<T>>> {
    return this.db.property.findMany(args as never) as Promise<
      Array<Prisma.PropertyGetPayload<T>>
    >;
  }

  findFirst<T extends Prisma.PropertyFindFirstArgs>(
    args: T,
  ): Promise<Prisma.PropertyGetPayload<T> | null> {
    return this.db.property.findFirst(args as never) as Promise<
      Prisma.PropertyGetPayload<T> | null
    >;
  }

  async count(args: Prisma.PropertyCountArgs) {
    return this.db.property.count(args);
  }

  async create(args: Prisma.PropertyCreateArgs) {
    return this.db.property.create(args);
  }

  async update(args: Prisma.PropertyUpdateArgs) {
    return this.db.property.update(args);
  }

  async updateMany(args: Prisma.PropertyUpdateManyArgs) {
    return this.db.property.updateMany(args);
  }

  // ── Galería ──────────────────────────────────────────────
  async createImage(args: Prisma.PropertyImageCreateArgs) {
    return this.db.propertyImage.create(args);
  }

  async findImage(args: Prisma.PropertyImageFindFirstArgs) {
    return this.db.propertyImage.findFirst(args);
  }

  async updateImage(args: Prisma.PropertyImageUpdateArgs) {
    return this.db.propertyImage.update(args);
  }

  async updateManyImages(args: Prisma.PropertyImageUpdateManyArgs) {
    return this.db.propertyImage.updateMany(args);
  }

  async deleteImage(id: string) {
    return this.db.propertyImage.delete({ where: { id } });
  }
}

export const propertyRepository = new PropertyRepository();
