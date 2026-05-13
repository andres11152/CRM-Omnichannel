import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { ProductType, ProductStatus } from "@prisma/client";
import { productRepository } from "@/repositories/ProductRepository";

/**
 * [PKG] PRODUCT CRUD SERVICE
 *
 * Data access layer for products catalog.
 */

export interface CreateProductDTO {
  name: string;
  sku?: string;
  price?: number;
  currency?: string;
  stock?: number;
  category?: string;
  type?: string;
  description?: string;
  imageUrl?: string;
  status?: string;
}

export const productCrudService = {
  async findAll(companyId: string) {
    return await productRepository.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
  },

  async create(companyId: string, data: CreateProductDTO) {
    if (data.sku) {
      const existing = await productRepository.findFirst({
        where: { companyId, sku: data.sku },
      });
      if (existing) {
        throw new AppError("A product with this SKU already exists", 400);
      }
    }

    const product = await productRepository.create({
      data: {
        companyId,
        name: data.name,
        sku: data.sku,
        price: data.price,
        currency: data.currency,
        stock: data.stock,
        category: data.category,
        type: data.type as ProductType | undefined,
        description: data.description,
        imageUrl: data.imageUrl,
        status: data.status as ProductStatus | undefined,
      },
    });

    Logger.info(`[Product] Created: ${product.name} (${product.id})`);

    return product;
  },

  async update(id: string, companyId: string, data: Record<string, unknown>) {
    const product = await productRepository.findFirst({
      where: { id, companyId },
    });

    if (!product) {
      throw new AppError("Product not found", 404);
    }

    const updated = await productRepository.update({
      where: { id },
      data,
    });

    Logger.info(`[Product] Updated: ${updated.name} (${updated.id})`);

    return updated;
  },

  async delete(id: string, companyId: string) {
    const product = await productRepository.findFirst({
      where: { id, companyId },
    });

    if (!product) {
      throw new AppError("Product not found", 404);
    }

    await productRepository.delete(id);
    Logger.info(`[Product] Deleted: ${product.name} (${id})`);
  },
};
