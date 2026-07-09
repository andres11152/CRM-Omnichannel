import { dealProductRepository } from "@/repositories/DealProductRepository";
import { dealRepository } from "@/repositories/DealRepository";
import { productRepository } from "@/repositories/ProductRepository";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { prisma } from "@/config/database";

export interface CreateDealProductDTO {
  productId: string;
  quantity?: number;
  discount?: number;
}

export const dealProductService = {
  /**
   * Recalculates and updates the Deal's total value based on its DealProducts (Line Items).
   * Calculates sum(unitPrice * quantity * (1 - discount/100))
   */
  async recalculateDealValue(dealId: string, companyId: string): Promise<number> {
    const items = await dealProductRepository.findMany({
      where: { dealId, companyId },
    });

    const totalValue = items.reduce((sum, item) => {
      const discountedPrice = item.unitPrice * (1 - item.discount / 100);
      return sum + discountedPrice * item.quantity;
    }, 0);

    // Update deal value in database
    await dealRepository.update(dealId, companyId, { value: totalValue });
    Logger.info(`[DealValueSync] Updated Deal ${dealId} total value to: ${totalValue}`);
    return totalValue;
  },

  async addProductToDeal(
    companyId: string,
    dealId: string,
    dto: CreateDealProductDTO
  ) {
    // 1. Verify Deal ownership
    const deal = await dealRepository.findById(dealId, companyId);
    if (!deal) {
      throw new AppError("Deal not found", 404);
    }

    // 2. Verify Product exists
    const product = await productRepository.findFirst({
      where: { id: dto.productId, companyId },
    });
    if (!product) {
      throw new AppError("Product not found in this company catalog", 404);
    }

    // 3. Create relation capture
    const dealProduct = await dealProductRepository.create({
      data: {
        companyId,
        dealId,
        productId: dto.productId,
        quantity: dto.quantity || 1,
        unitPrice: product.price, // Lock transaction price
        discount: dto.discount || 0,
      },
      include: {
        product: {
          select: { name: true, sku: true }
        }
      }
    });

    Logger.info(`[DealProduct] Associated product ${product.name} to deal ${dealId}`);

    // 4. Sync Deal value
    await this.recalculateDealValue(dealId, companyId);

    return dealProduct;
  },

  async updateDealProduct(
    companyId: string,
    dealProductId: string,
    data: { quantity?: number; discount?: number; unitPrice?: number }
  ) {
    const item = await dealProductRepository.findFirst({
      where: { id: dealProductId, companyId },
    });

    if (!item) {
      throw new AppError("Line item not found", 404);
    }

    const updated = await dealProductRepository.update({
      where: { id: dealProductId },
      data,
    });

    Logger.info(`[DealProduct] Updated line item ${dealProductId}`);

    // Sync Deal value
    await this.recalculateDealValue(item.dealId, companyId);

    return updated;
  },

  async removeProductFromDeal(companyId: string, dealProductId: string) {
    const item = await dealProductRepository.findFirst({
      where: { id: dealProductId, companyId },
    });

    if (!item) {
      throw new AppError("Line item not found", 404);
    }

    await dealProductRepository.delete(dealProductId);
    Logger.info(`[DealProduct] Removed line item ${dealProductId} from deal ${item.dealId}`);

    // Sync Deal value
    await this.recalculateDealValue(item.dealId, companyId);
  },

  async getDealProducts(companyId: string, dealId: string) {
    return await dealProductRepository.findMany({
      where: { dealId, companyId },
      include: {
        product: {
          select: {
            name: true,
            sku: true,
            category: true,
            imageUrl: true,
          }
        }
      }
    });
  }
};
