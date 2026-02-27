import { Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";
import { AuthenticatedRequest } from "../types/types";
import {
  productCrudService,
  CreateProductDTO,
} from "../services/productCrudService";

/**
 * 📦 PRODUCT CONTROLLER
 *
 * HTTP orchestrator for product catalog.
 * All data access delegated to productCrudService (SRP).
 */

class ProductController {
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

      const products = await productCrudService.findAll(companyId);

      res.status(200).json({
        status: "success",
        data: products,
      });
    } catch (error) {
      next(error);
    }
  };

  createProduct = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const companyId = req.user?.companyId;

      if (!companyId) {
        return next(new AppError("User does not belong to a company", 403));
      }

      const product = await productCrudService.create(
        companyId,
        req.body as CreateProductDTO,
      );

      res.status(201).json({
        status: "success",
        data: product,
      });
    } catch (error) {
      next(error);
    }
  };

  updateProduct = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const companyId = req.user?.companyId;

      if (!companyId) {
        return next(new AppError("User does not belong to a company", 403));
      }

      const updatedProduct = await productCrudService.update(
        id,
        companyId,
        req.body,
      );

      res.status(200).json({
        status: "success",
        data: updatedProduct,
      });
    } catch (error) {
      next(error);
    }
  };

  deleteProduct = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const companyId = req.user?.companyId;

      if (!companyId) {
        return next(new AppError("User does not belong to a company", 403));
      }

      await productCrudService.delete(id, companyId);

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
