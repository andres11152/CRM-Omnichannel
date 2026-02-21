import { Response, NextFunction } from "express";
import { prisma } from "../config/database";
import { AppError } from "../utils/AppError";
import { AuthenticatedRequest } from "../types/types";
import { Logger } from "../utils/logger";

class ProductController {
  // Get all products for the logged-in company
  getAllProducts = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const companyId = req.user?.companyId;

      if (!companyId) {
        return next(new AppError("User does not belong to a company", 403));
      }

      const products = await prisma.product.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
      });

      res.status(200).json({
        status: "success",
        data: products,
      });
    } catch (error) {
      next(error);
    }
  };

  // Create a new product
  createProduct = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const companyId = req.user?.companyId;
      // Validated by CreateProductSchema
      const data = req.body;

      if (!companyId) {
        return next(new AppError("User does not belong to a company", 403));
      }

      if (data.sku) {
        const existing = await prisma.product.findFirst({
          where: { companyId, sku: data.sku },
        });
        if (existing) {
          return next(
            new AppError("A product with this SKU already exists", 400),
          );
        }
      }

      const product = await prisma.product.create({
        data: {
          companyId,
          name: data.name,
          sku: data.sku,
          price: data.price,
          currency: data.currency,
          stock: data.stock,
          category: data.category,
          type: data.type,
          description: data.description,
          imageUrl: data.imageUrl,
          status: data.status,
        },
      });

      res.status(201).json({
        status: "success",
        data: product,
      });
    } catch (error) {
      Logger.error("[ProductController] Error creating product:", error);
      next(error);
    }
  };

  // Update a product
  updateProduct = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      // Validated by UpdateProductSchema
      const { id } = req.params;
      const data = req.body;
      const companyId = req.user?.companyId;

      const product = await prisma.product.findFirst({
        where: { id, companyId },
      });

      if (!product) {
        return next(new AppError("Product not found", 404));
      }

      const updatedProduct = await prisma.product.update({
        where: { id },
        data,
      });

      res.status(200).json({
        status: "success",
        data: updatedProduct,
      });
    } catch (error) {
      Logger.error("[ProductController] Error updating product:", error);
      next(error);
    }
  };

  // Delete a product
  deleteProduct = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const companyId = req.user?.companyId;

      const product = await prisma.product.findFirst({
        where: { id, companyId },
      });

      if (!product) {
        return next(new AppError("Product not found", 404));
      }

      await prisma.product.delete({
        where: { id },
      });

      res.status(204).json({
        status: "success",
        data: null,
      });
    } catch (error) {
      Logger.error("[ProductController] Error deleting product:", error);
      next(error);
    }
  };
}

export const productController = new ProductController();
