/// <reference types="jest" />
import { propertyCrudService } from "../src/services/PropertyCrudService";
import { propertyRepository } from "../src/repositories/PropertyRepository";
import { AppError } from "../src/utils/AppError";

jest.mock("../src/repositories/PropertyRepository", () => {
  const mockInstance = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    createImage: jest.fn(),
    findImage: jest.fn(),
    updateImage: jest.fn(),
    updateManyImages: jest.fn(),
    deleteImage: jest.fn(),
  };
  return {
    PropertyRepository: jest.fn(() => mockInstance),
    propertyRepository: mockInstance,
  };
});

const repo = propertyRepository as unknown as Record<string, jest.Mock>;

const companyId = "company_123";
const userId = "user_456";

const baseDTO = {
  operation: "VENTA",
  kind: "APARTAMENTO",
  title: "Apartamento amplio en Chapinero",
  price: 350_000_000,
};

const buildProperty = (overrides: Record<string, unknown> = {}) => ({
  id: "prop_1",
  companyId,
  reference: "INM-000001",
  slug: "apartamento-amplio-en-chapinero-abc12",
  publicId: "pub_1",
  title: baseDTO.title,
  price: baseDTO.price,
  builtArea: null,
  images: [],
  ...overrides,
});

describe("PropertyCrudService", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("create", () => {
    it("genera reference secuencial INM-XXXXXX y slug a partir del título", async () => {
      // El último ref existente es 41 → el siguiente debe ser 42, sin importar
      // cuántas filas queden en la tabla (huecos por hard-delete no rompen esto).
      repo.findFirst.mockResolvedValue({ reference: "INM-000041" });
      repo.create.mockImplementation(({ data }) =>
        Promise.resolve(buildProperty(data)),
      );

      const result = await propertyCrudService.create(companyId, baseDTO);

      expect(repo.create).toHaveBeenCalledTimes(1);
      const created = repo.create.mock.calls[0][0].data;
      expect(created.reference).toBe("INM-000042");
      expect(created.slug).toMatch(/^apartamento-amplio-en-chapinero-[a-z0-9]{5}$/);
      expect(created.companyId).toBe(companyId);
      expect(result.reference).toBe("INM-000042");
    });

    it("genera INM-000001 cuando no hay propiedades previas", async () => {
      repo.findFirst.mockResolvedValue(null);
      repo.create.mockImplementation(({ data }) =>
        Promise.resolve(buildProperty(data)),
      );

      const result = await propertyCrudService.create(companyId, baseDTO);

      expect(result.reference).toBe("INM-000001");
    });

    it("no colisiona con huecos dejados por propiedades borradas (hard delete)", async () => {
      // Reproduce el bug real: quedan 2 filas en la tabla pero el último
      // número usado fue el 3 (una fue hard-deleted). Un conteo naive de
      // filas generaría "INM-000003" de nuevo y colisionaría con la
      // existente; basarse en el máximo real evita eso.
      repo.findFirst.mockResolvedValue({ reference: "INM-000003" });
      repo.create.mockImplementation(({ data }) =>
        Promise.resolve(buildProperty(data)),
      );

      const result = await propertyCrudService.create(companyId, baseDTO);

      expect(result.reference).toBe("INM-000004");
    });

    it("calcula pricePerM2 cuando hay precio y área construida", async () => {
      repo.findFirst.mockResolvedValue(null);
      repo.create.mockImplementation(({ data }) =>
        Promise.resolve(buildProperty(data)),
      );

      await propertyCrudService.create(companyId, {
        ...baseDTO,
        price: 300_000_000,
        builtArea: 75,
      });

      expect(repo.create.mock.calls[0][0].data.pricePerM2).toBe(4_000_000);
    });

    it("rechaza estrato fuera del rango 1-6", async () => {
      await expect(
        propertyCrudService.create(companyId, { ...baseDTO, stratum: 7 }),
      ).rejects.toThrow(AppError);
      await expect(
        propertyCrudService.create(companyId, { ...baseDTO, stratum: 0 }),
      ).rejects.toThrow("estrato");
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("rechaza características fuera del catálogo", async () => {
      await expect(
        propertyCrudService.create(companyId, {
          ...baseDTO,
          features: ["Piscina de lava"],
        }),
      ).rejects.toThrow("Característica no válida");
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("calcula pricePerM2 con lotArea cuando no hay builtArea (LOTE/FINCA)", async () => {
      repo.findFirst.mockResolvedValue(null);
      repo.create.mockImplementation(({ data }) =>
        Promise.resolve(buildProperty(data)),
      );

      await propertyCrudService.create(companyId, {
        ...baseDTO,
        kind: "LOTE",
        price: 200_000_000,
        lotArea: 500,
      });

      expect(repo.create.mock.calls[0][0].data.pricePerM2).toBe(400_000);
    });

    it("crea un inmueble comercial (BODEGA) con sus atributos propios", async () => {
      repo.findFirst.mockResolvedValue(null);
      repo.create.mockImplementation(({ data }) =>
        Promise.resolve(buildProperty(data)),
      );

      await propertyCrudService.create(companyId, {
        ...baseDTO,
        kind: "BODEGA",
        frontage: 12,
        depth: 30,
        ceilingHeight: 8,
        hasLoadingDock: true,
        hasMezzanine: true,
        powerType: "TRIFASICA",
        permittedUse: "Almacenamiento e industria liviana",
        features: ["Piso en concreto reforzado", "Bodega de almacenamiento"],
      });

      const created = repo.create.mock.calls[0][0].data;
      expect(created.kind).toBe("BODEGA");
      expect(created.frontage).toBe(12);
      expect(created.depth).toBe(30);
      expect(created.ceilingHeight).toBe(8);
      expect(created.hasLoadingDock).toBe(true);
      expect(created.hasMezzanine).toBe(true);
      expect(created.powerType).toBe("TRIFASICA");
      expect(created.permittedUse).toBe("Almacenamiento e industria liviana");
    });
  });

  describe("findAll", () => {
    it("filtra por companyId y excluye soft-deleted", async () => {
      repo.findMany.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);

      await propertyCrudService.findAll(companyId);

      const where = repo.findMany.mock.calls[0][0].where;
      expect(where.companyId).toBe(companyId);
      expect(where.deletedAt).toBeNull();
    });

    it("aplica filtros de estrato, precio y ciudad", async () => {
      repo.findMany.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);

      await propertyCrudService.findAll(companyId, {
        stratum: 4,
        priceMin: 100_000_000,
        priceMax: 500_000_000,
        city: "Bogotá",
      });

      const where = repo.findMany.mock.calls[0][0].where;
      expect(where.stratum).toBe(4);
      expect(where.price).toEqual({ gte: 100_000_000, lte: 500_000_000 });
      expect(where.city).toEqual({ contains: "Bogotá", mode: "insensitive" });
    });

    it("devuelve metadatos de paginación", async () => {
      repo.findMany.mockResolvedValue([buildProperty()]);
      repo.count.mockResolvedValue(45);

      const result = await propertyCrudService.findAll(companyId, {
        page: 2,
        limit: 20,
      });

      expect(result.total).toBe(45);
      expect(result.page).toBe(2);
      expect(result.totalPages).toBe(3);
      expect(repo.findMany.mock.calls[0][0].skip).toBe(20);
    });
  });

  describe("findById", () => {
    it("lanza 404 si el inmueble no existe o es de otra empresa", async () => {
      repo.findFirst.mockResolvedValue(null);

      await expect(
        propertyCrudService.findById("prop_x", companyId),
      ).rejects.toThrow("Inmueble no encontrado");

      const where = repo.findFirst.mock.calls[0][0].where;
      expect(where.companyId).toBe(companyId);
      expect(where.deletedAt).toBeNull();
    });
  });

  describe("update", () => {
    it("recalcula pricePerM2 cuando cambia el precio", async () => {
      repo.findFirst.mockResolvedValue(buildProperty({ builtArea: 100 }));
      repo.update.mockImplementation(({ data }) =>
        Promise.resolve(buildProperty(data)),
      );

      await propertyCrudService.update("prop_1", companyId, {
        price: 400_000_000,
      });

      expect(repo.update.mock.calls[0][0].data.pricePerM2).toBe(4_000_000);
    });

    it("no permite sobreescribir reference/slug/companyId", async () => {
      repo.findFirst.mockResolvedValue(buildProperty());
      repo.update.mockImplementation(({ data }) =>
        Promise.resolve(buildProperty(data)),
      );

      await propertyCrudService.update("prop_1", companyId, {
        title: "Nuevo título",
        reference: "HACK-1",
        slug: "hack",
        companyId: "otra_empresa",
      });

      const data = repo.update.mock.calls[0][0].data;
      expect(data.reference).toBeUndefined();
      expect(data.slug).toBeUndefined();
      expect(data.companyId).toBeUndefined();
      expect(data.title).toBe("Nuevo título");
    });
  });

  describe("setPublished", () => {
    it("al publicar setea publishedAt y pasa BORRADOR a DISPONIBLE", async () => {
      repo.findFirst.mockResolvedValue(buildProperty());
      repo.update.mockImplementation(({ data }) =>
        Promise.resolve(buildProperty(data)),
      );

      await propertyCrudService.setPublished("prop_1", companyId, true);

      const data = repo.update.mock.calls[0][0].data;
      expect(data.isPublished).toBe(true);
      expect(data.publishedAt).toBeInstanceOf(Date);
      expect(data.status).toBe("DISPONIBLE");
    });

    it("al despublicar limpia publishedAt sin tocar status", async () => {
      repo.findFirst.mockResolvedValue(buildProperty());
      repo.update.mockImplementation(({ data }) =>
        Promise.resolve(buildProperty(data)),
      );

      await propertyCrudService.setPublished("prop_1", companyId, false);

      const data = repo.update.mock.calls[0][0].data;
      expect(data.isPublished).toBe(false);
      expect(data.publishedAt).toBeNull();
      expect(data.status).toBeUndefined();
    });
  });

  describe("softDelete", () => {
    it("marca deletedAt/deletedBy y despublica", async () => {
      repo.findFirst.mockResolvedValue(buildProperty());
      repo.update.mockResolvedValue(buildProperty());

      await propertyCrudService.softDelete("prop_1", companyId, userId);

      const data = repo.update.mock.calls[0][0].data;
      expect(data.deletedAt).toBeInstanceOf(Date);
      expect(data.deletedBy).toBe(userId);
      expect(data.isPublished).toBe(false);
    });
  });
});
