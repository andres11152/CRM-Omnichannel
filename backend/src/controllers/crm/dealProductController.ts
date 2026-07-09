import { Response, NextFunction } from "express";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { dealProductService } from "@/services/DealProductService";

class DealProductController {
  getProductsForDeal = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { id: dealId } = req.params;
      const companyId = req.user?.companyId;

      if (!companyId) {
        return next(new AppError("User does not belong to a company", 403));
      }

      const products = await dealProductService.getDealProducts(companyId, dealId);

      res.status(200).json({
        status: "success",
        data: products,
      });
    } catch (error) {
      next(error);
    }
  };

  addProductToDeal = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { id: dealId } = req.params;
      const companyId = req.user?.companyId;

      if (!companyId) {
        return next(new AppError("User does not belong to a company", 403));
      }

      const dealProduct = await dealProductService.addProductToDeal(
        companyId,
        dealId,
        req.body as unknown as any
      );

      res.status(201).json({
        status: "success",
        data: dealProduct,
      });
    } catch (error) {
      next(error);
    }
  };

  updateDealProduct = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { dealProductId } = req.params;
      const companyId = req.user?.companyId;

      if (!companyId) {
        return next(new AppError("User does not belong to a company", 403));
      }

      const updated = await dealProductService.updateDealProduct(
        companyId,
        dealProductId,
        req.body
      );

      res.status(200).json({
        status: "success",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };

  removeProductFromDeal = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { dealProductId } = req.params;
      const companyId = req.user?.companyId;

      if (!companyId) {
        return next(new AppError("User does not belong to a company", 403));
      }

      await dealProductService.removeProductFromDeal(companyId, dealProductId);

      res.status(204).json({
        status: "success",
        data: null,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const dealProductController = new DealProductController();
