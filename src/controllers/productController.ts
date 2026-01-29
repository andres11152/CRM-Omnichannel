import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/database";
import { AppError } from "../utils/AppError";
import { AuthenticatedRequest } from "../types/types";

class ProductController {
  // Get all products for the logged-in company
  getAllProducts = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
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
    next: NextFunction
  ) => {
    try {
      const companyId = req.user?.companyId;
      const {
        name,
        sku,
        price,
        currency,
        stock,
        category,
        type,
        description,
        imageUrl,
        status,
      } = req.body;

      if (!companyId) {
        return next(new AppError("User does not belong to a company", 403));
      }

      // Optional: Check if SKU exists per company logic (not strict unique in DB but good logic)
      if (sku) {
        const existing = await prisma.product.findFirst({
          where: { companyId, sku },
        });
        if (existing) {
          // Just warn or block? Let's allow duplicates for now or Append unique ID if user insists, strict SaaS logic implies rejection.
          // return next(new AppError("SKU already exists", 400));
        }
      }

      console.log("[CreateProduct] Body received:", req.body);

      const product = await prisma.product.create({
        data: {
          companyId,
          name,
          sku: sku || undefined, // Avoid empty string unique constraint issues if any, though it's optional
          price: parseFloat(String(price)),
          currency: currency || "USD",
          stock: stock ? parseInt(String(stock)) : 0,
          category: category || "General",
          type: type || "Physical",
          description: description || null,
          imageUrl: imageUrl || null,
          status: status || "active",
        },
      });

      res.status(201).json({
        status: "success",
        data: product,
      });
    } catch (error) {
      console.error("Error creating product:", error);
      next(error);
    }
  };

  // Update a product
  updateProduct = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
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

      const updatedProduct = await prisma.product.update({
        where: { id },
        data: req.body,
      });

      res.status(200).json({
        status: "success",
        data: updatedProduct,
      });
    } catch (error) {
      next(error);
    }
  };

  // Delete a product
  deleteProduct = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
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
      next(error);
    }
  };
}

export const productController = new ProductController();
