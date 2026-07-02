import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { Prisma } from "@prisma/client";
import { propertyRepository } from "@/repositories/PropertyRepository";
import { VALID_AMENITIES, VALID_FEATURES } from "@/constants/propertyCatalogs";

/**
 * [REAL ESTATE] PROPERTY CRUD SERVICE
 *
 * Lógica de negocio del módulo inmobiliario: generación de referencia/slug,
 * cálculo de precio por m², validaciones (estrato, catálogos), filtros de
 * búsqueda avanzada, soft-delete y publicación. Todo scopeado por companyId.
 */

export interface CreatePropertyDTO {
  operation: string;
  kind: string;
  title: string;
  price: number;
  status?: string;
  condition?: string;
  description?: string;
  highlights?: string[];
  currency?: string;
  adminFee?: number;
  priceIncludesAdmin?: boolean;
  negotiable?: boolean;
  builtArea?: number;
  privateArea?: number;
  lotArea?: number;
  bedrooms?: number;
  bathrooms?: number;
  parkingSpots?: number;
  floor?: number;
  totalFloors?: number;
  yearBuilt?: number;
  stratum?: number;
  department?: string;
  city?: string;
  neighborhood?: string;
  address?: string;
  addressVisible?: boolean;
  latitude?: number;
  longitude?: number;
  zipCode?: string;
  registryNumber?: string;
  cadastralNumber?: string;
  isExclusive?: boolean;
  capturedAt?: string;
  commissionPct?: number;
  features?: string[];
  amenities?: string[];
  videoUrl?: string;
  virtualTourUrl?: string;
  ownerContactId?: string;
  ownerAccountId?: string;
  assignedToId?: string;
  dealId?: string;
}

export interface PropertyFilters {
  operation?: string;
  kind?: string;
  status?: string;
  city?: string;
  neighborhood?: string;
  stratum?: number;
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  bedroomsMin?: number;
  bathroomsMin?: number;
  q?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

const OWNER_INCLUDE = {
  images: { orderBy: { order: "asc" } as const },
  ownerContact: { select: { id: true, name: true, phone: true, email: true } },
  ownerAccount: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
} satisfies Prisma.PropertyInclude;

/** Normaliza un texto a slug web-safe. */
const slugify = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes/diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "inmueble";

const round2 = (n: number): number => Math.round(n * 100) / 100;

const validateStratum = (stratum?: number): void => {
  if (stratum !== undefined && stratum !== null) {
    if (!Number.isInteger(stratum) || stratum < 1 || stratum > 6) {
      throw new AppError("El estrato debe ser un número entre 1 y 6", 400);
    }
  }
};

const validateCatalogArrays = (features?: string[], amenities?: string[]): void => {
  const badFeature = (features ?? []).find((f) => !VALID_FEATURES.has(f));
  if (badFeature) {
    throw new AppError(`Característica no válida: ${badFeature}`, 400);
  }
  const badAmenity = (amenities ?? []).find((a) => !VALID_AMENITIES.has(a));
  if (badAmenity) {
    throw new AppError(`Amenidad no válida: ${badAmenity}`, 400);
  }
};

export const propertyCrudService = {
  async findAll(companyId: string, filters: PropertyFilters = {}) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));

    const where: Prisma.PropertyWhereInput = {
      companyId,
      deletedAt: null,
      ...(filters.operation && { operation: filters.operation as never }),
      ...(filters.kind && { kind: filters.kind as never }),
      ...(filters.status && { status: filters.status as never }),
      ...(filters.city && { city: { contains: filters.city, mode: "insensitive" } }),
      ...(filters.neighborhood && {
        neighborhood: { contains: filters.neighborhood, mode: "insensitive" },
      }),
      ...(filters.stratum !== undefined && { stratum: filters.stratum }),
      ...((filters.priceMin !== undefined || filters.priceMax !== undefined) && {
        price: {
          ...(filters.priceMin !== undefined && { gte: filters.priceMin }),
          ...(filters.priceMax !== undefined && { lte: filters.priceMax }),
        },
      }),
      ...((filters.areaMin !== undefined || filters.areaMax !== undefined) && {
        builtArea: {
          ...(filters.areaMin !== undefined && { gte: filters.areaMin }),
          ...(filters.areaMax !== undefined && { lte: filters.areaMax }),
        },
      }),
      ...(filters.bedroomsMin !== undefined && { bedrooms: { gte: filters.bedroomsMin } }),
      ...(filters.bathroomsMin !== undefined && { bathrooms: { gte: filters.bathroomsMin } }),
      ...(filters.q && {
        OR: [
          { title: { contains: filters.q, mode: "insensitive" } },
          { reference: { contains: filters.q, mode: "insensitive" } },
          { description: { contains: filters.q, mode: "insensitive" } },
          { address: { contains: filters.q, mode: "insensitive" } },
        ],
      }),
    };

    const orderBy = ((): Prisma.PropertyOrderByWithRelationInput => {
      switch (filters.sort) {
        case "price_asc":
          return { price: "asc" };
        case "price_desc":
          return { price: "desc" };
        case "oldest":
          return { createdAt: "asc" };
        default:
          return { createdAt: "desc" };
      }
    })();

    const [items, total] = await Promise.all([
      propertyRepository.findMany({
        where,
        include: OWNER_INCLUDE,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      propertyRepository.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  async findById(id: string, companyId: string) {
    const property = await propertyRepository.findFirst({
      where: { id, companyId, deletedAt: null },
      include: OWNER_INCLUDE,
    });
    if (!property) {
      throw new AppError("Inmueble no encontrado", 404);
    }
    return property;
  },

  /**
   * Genera una referencia única tipo INM-000123, basada en el número más alto
   * ya usado por la empresa (no en un conteo de filas). Un conteo se
   * desincroniza en cuanto se borra una propiedad (hard delete) o queda una
   * soft-deleted, generando el mismo número repetido en cada intento del
   * retry de `create()` y garantizando la colisión en vez de evitarla.
   * Ordenar por `reference` desc funciona porque el prefijo "INM-" y el
   * padding a 6 dígitos hacen que el orden lexicográfico == orden numérico.
   */
  async generateReference(companyId: string): Promise<string> {
    const last = await propertyRepository.findFirst({
      where: { companyId },
      orderBy: { reference: "desc" },
      select: { reference: true },
    });
    const lastNum = last ? parseInt(last.reference.replace("INM-", ""), 10) || 0 : 0;
    return `INM-${String(lastNum + 1).padStart(6, "0")}`;
  },

  async create(companyId: string, data: CreatePropertyDTO) {
    validateStratum(data.stratum);
    validateCatalogArrays(data.features, data.amenities);

    const pricePerM2 =
      data.price && data.builtArea && data.builtArea > 0
        ? round2(data.price / data.builtArea)
        : null;

    // Reintenta hasta 3 veces por posible colisión de referencia bajo concurrencia.
    for (let attempt = 0; attempt < 3; attempt++) {
      const reference = await this.generateReference(companyId);
      const slug = `${slugify(data.title)}-${Math.random().toString(36).slice(2, 7)}`;
      try {
        const property = await propertyRepository.create({
          data: {
            companyId,
            reference,
            slug,
            operation: data.operation as never,
            kind: data.kind as never,
            status: (data.status as never) ?? undefined,
            condition: (data.condition as never) ?? undefined,
            title: data.title,
            description: data.description,
            highlights: data.highlights ?? [],
            price: data.price,
            currency: data.currency ?? "COP",
            adminFee: data.adminFee,
            priceIncludesAdmin: data.priceIncludesAdmin ?? false,
            negotiable: data.negotiable ?? false,
            pricePerM2,
            builtArea: data.builtArea,
            privateArea: data.privateArea,
            lotArea: data.lotArea,
            bedrooms: data.bedrooms,
            bathrooms: data.bathrooms,
            parkingSpots: data.parkingSpots,
            floor: data.floor,
            totalFloors: data.totalFloors,
            yearBuilt: data.yearBuilt,
            stratum: data.stratum,
            department: data.department,
            city: data.city,
            neighborhood: data.neighborhood,
            address: data.address,
            addressVisible: data.addressVisible ?? false,
            latitude: data.latitude,
            longitude: data.longitude,
            zipCode: data.zipCode,
            registryNumber: data.registryNumber,
            cadastralNumber: data.cadastralNumber,
            isExclusive: data.isExclusive ?? false,
            capturedAt: data.capturedAt ? new Date(data.capturedAt) : undefined,
            commissionPct: data.commissionPct,
            features: data.features ?? [],
            amenities: data.amenities ?? [],
            videoUrl: data.videoUrl,
            virtualTourUrl: data.virtualTourUrl,
            ownerContactId: data.ownerContactId,
            ownerAccountId: data.ownerAccountId,
            assignedToId: data.assignedToId,
            dealId: data.dealId,
          },
          include: OWNER_INCLUDE,
        });
        Logger.info(`[Property] Created ${property.reference} (${property.id})`);
        return property;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002" &&
          attempt < 2
        ) {
          Logger.warn(`[Property] Reference/slug collision, retrying (${attempt + 1})`);
          continue;
        }
        throw err;
      }
    }
    throw new AppError("No se pudo generar una referencia única para el inmueble", 500);
  },

  async update(id: string, companyId: string, data: Record<string, unknown>) {
    await this.findById(id, companyId); // valida existencia + tenant

    if ("stratum" in data) validateStratum(data.stratum as number | undefined);
    if ("features" in data || "amenities" in data) {
      validateCatalogArrays(
        data.features as string[] | undefined,
        data.amenities as string[] | undefined,
      );
    }

    // Recalcula pricePerM2 si cambian precio o área.
    const patch: Record<string, unknown> = { ...data };
    delete patch.id;
    delete patch.companyId;
    delete patch.reference;
    delete patch.slug;
    delete patch.publicId;
    if (patch.capturedAt) patch.capturedAt = new Date(patch.capturedAt as string);

    if ("price" in data || "builtArea" in data) {
      const current = await propertyRepository.findFirst({ where: { id, companyId } });
      const price = (data.price as number) ?? current?.price;
      const area = (data.builtArea as number) ?? current?.builtArea ?? 0;
      patch.pricePerM2 = price && area > 0 ? round2(price / area) : null;
    }

    const updated = await propertyRepository.update({
      where: { id },
      data: patch,
      include: OWNER_INCLUDE,
    });
    Logger.info(`[Property] Updated ${updated.reference} (${id})`);
    return updated;
  },

  async setPublished(id: string, companyId: string, isPublished: boolean) {
    await this.findById(id, companyId);
    const updated = await propertyRepository.update({
      where: { id },
      data: {
        isPublished,
        publishedAt: isPublished ? new Date() : null,
        // Al publicar por primera vez desde BORRADOR, pasa a DISPONIBLE.
        ...(isPublished && { status: "DISPONIBLE" as never }),
      },
      include: OWNER_INCLUDE,
    });
    Logger.info(`[Property] ${isPublished ? "Published" : "Unpublished"} ${updated.reference}`);
    return updated;
  },

  async softDelete(id: string, companyId: string, userId: string) {
    await this.findById(id, companyId);
    await propertyRepository.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId, isPublished: false },
    });
    Logger.info(`[Property] Soft-deleted ${id} by ${userId}`);
  },
};
