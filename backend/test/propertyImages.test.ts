/// <reference types="jest" />
import { propertyImageService } from "../src/services/PropertyImageService";
import { propertyRepository } from "../src/repositories/PropertyRepository";
import { uploadFile, deleteFile } from "../src/services/UploadService";
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

jest.mock("../src/services/UploadService", () => ({
  uploadFile: jest.fn(),
  deleteFile: jest.fn(),
}));

const repo = propertyRepository as unknown as Record<string, jest.Mock>;
const mockUpload = uploadFile as jest.Mock;
const mockDelete = deleteFile as jest.Mock;

const companyId = "company_123";
const propertyId = "prop_1";

const img = (id: string, order: number, isCover = false) => ({
  id,
  propertyId,
  url: `https://bucket.s3.amazonaws.com/${companyId}/image/${id}.jpg`,
  key: `${companyId}/image/${id}.jpg`,
  order,
  isCover,
});

const buildProperty = (images: unknown[] = []) => ({
  id: propertyId,
  companyId,
  reference: "INM-000001",
  images,
});

const fakeFile = (name: string) =>
  ({
    fieldname: "images",
    originalname: name,
    mimetype: "image/jpeg",
    size: 1024,
    buffer: Buffer.from("fake"),
  }) as never;

describe("PropertyImageService", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("addImages", () => {
    it("sube a S3 vía uploadFile con type IMAGE y marca la primera como portada", async () => {
      repo.findFirst.mockResolvedValue(buildProperty([]));
      mockUpload.mockResolvedValue({
        url: "https://bucket.s3.amazonaws.com/x.jpg",
        key: "x.jpg",
      });
      repo.createImage.mockImplementation(({ data }) =>
        Promise.resolve({ id: `img_${data.order}`, ...data }),
      );

      const created = await propertyImageService.addImages(
        propertyId,
        companyId,
        [fakeFile("a.jpg"), fakeFile("b.jpg")],
      );

      expect(mockUpload).toHaveBeenCalledTimes(2);
      expect(mockUpload.mock.calls[0][1]).toEqual({ companyId, type: "IMAGE" });
      expect(created).toHaveLength(2);
      // Solo la primera queda como portada
      expect(repo.createImage.mock.calls[0][0].data.isCover).toBe(true);
      expect(repo.createImage.mock.calls[1][0].data.isCover).toBe(false);
    });

    it("no marca portada si ya existe una", async () => {
      repo.findFirst.mockResolvedValue(buildProperty([img("img_0", 0, true)]));
      mockUpload.mockResolvedValue({ url: "u", key: "k" });
      repo.createImage.mockImplementation(({ data }) =>
        Promise.resolve({ id: "img_1", ...data }),
      );

      await propertyImageService.addImages(propertyId, companyId, [
        fakeFile("c.jpg"),
      ]);

      expect(repo.createImage.mock.calls[0][0].data.isCover).toBe(false);
      expect(repo.createImage.mock.calls[0][0].data.order).toBe(1);
    });

    it("rechaza si no se envían archivos", async () => {
      await expect(
        propertyImageService.addImages(propertyId, companyId, []),
      ).rejects.toThrow(AppError);
      expect(mockUpload).not.toHaveBeenCalled();
    });

    it("rechaza si el inmueble es de otra empresa", async () => {
      repo.findFirst.mockResolvedValue(null);
      await expect(
        propertyImageService.addImages(propertyId, "otra_empresa", [
          fakeFile("a.jpg"),
        ]),
      ).rejects.toThrow("Inmueble no encontrado");
    });
  });

  describe("deleteImage", () => {
    it("borra la key de S3 y la fila en BD", async () => {
      repo.findFirst.mockResolvedValue(buildProperty([img("img_1", 0)]));
      repo.findImage.mockResolvedValue(img("img_1", 0));
      mockDelete.mockResolvedValue(undefined);

      await propertyImageService.deleteImage(propertyId, "img_1", companyId);

      expect(mockDelete).toHaveBeenCalledWith(`${companyId}/image/img_1.jpg`);
      expect(repo.deleteImage).toHaveBeenCalledWith("img_1");
    });

    it("si era portada, promueve la siguiente imagen", async () => {
      repo.findFirst.mockResolvedValue(
        buildProperty([img("img_1", 0, true), img("img_2", 1)]),
      );
      repo.findImage
        .mockResolvedValueOnce(img("img_1", 0, true)) // la que se borra
        .mockResolvedValueOnce(img("img_2", 1)); // la sucesora
      mockDelete.mockResolvedValue(undefined);

      await propertyImageService.deleteImage(propertyId, "img_1", companyId);

      expect(repo.updateImage).toHaveBeenCalledWith({
        where: { id: "img_2" },
        data: { isCover: true },
      });
    });

    it("el borrado en BD procede aunque S3 falle (best-effort)", async () => {
      repo.findFirst.mockResolvedValue(buildProperty([img("img_1", 0)]));
      repo.findImage.mockResolvedValue(img("img_1", 0));
      mockDelete.mockRejectedValue(new Error("S3 down"));

      await propertyImageService.deleteImage(propertyId, "img_1", companyId);

      expect(repo.deleteImage).toHaveBeenCalledWith("img_1");
    });
  });

  describe("setCover", () => {
    it("desmarca todas y marca solo la elegida", async () => {
      repo.findFirst.mockResolvedValue(
        buildProperty([img("img_1", 0, true), img("img_2", 1)]),
      );
      repo.findImage.mockResolvedValue(img("img_2", 1));

      await propertyImageService.setCover(propertyId, companyId, "img_2");

      expect(repo.updateManyImages).toHaveBeenCalledWith({
        where: { propertyId },
        data: { isCover: false },
      });
      expect(repo.updateImage).toHaveBeenCalledWith({
        where: { id: "img_2" },
        data: { isCover: true },
      });
    });
  });

  describe("reorderImages", () => {
    it("asigna order según el índice del arreglo", async () => {
      repo.findFirst.mockResolvedValue(
        buildProperty([img("img_1", 0), img("img_2", 1), img("img_3", 2)]),
      );

      await propertyImageService.reorderImages(propertyId, companyId, [
        "img_3",
        "img_1",
        "img_2",
      ]);

      expect(repo.updateImage).toHaveBeenCalledWith({
        where: { id: "img_3" },
        data: { order: 0 },
      });
      expect(repo.updateImage).toHaveBeenCalledWith({
        where: { id: "img_1" },
        data: { order: 1 },
      });
      expect(repo.updateImage).toHaveBeenCalledWith({
        where: { id: "img_2" },
        data: { order: 2 },
      });
    });

    it("rechaza IDs que no pertenecen al inmueble", async () => {
      repo.findFirst.mockResolvedValue(buildProperty([img("img_1", 0)]));

      await expect(
        propertyImageService.reorderImages(propertyId, companyId, ["img_ajena"]),
      ).rejects.toThrow("no pertenece a este inmueble");
      expect(repo.updateImage).not.toHaveBeenCalled();
    });
  });
});
