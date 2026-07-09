import { Router } from "express";
import { dealProductController } from "@/controllers/crm/dealProductController";
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import {
  AddProductToDealSchema,
  UpdateDealProductSchema,
  DealIdParamSchema,
  DealProductParamsSchema,
} from "@/schemas/dealProductSchema";

const router = Router();

// Apply authentication guard to all deal-product operations
router.use(protect);

// Nested routes: /api/deals/:id/products
router
  .route("/:id/products")
  .get(validate(DealIdParamSchema), dealProductController.getProductsForDeal)
  .post(validate(AddProductToDealSchema), dealProductController.addProductToDeal);

// Direct updates: /api/deals/:id/products/:dealProductId
router
  .route("/:id/products/:dealProductId")
  .patch(validate(DealProductParamsSchema), validate(UpdateDealProductSchema), dealProductController.updateDealProduct)
  .delete(validate(DealProductParamsSchema), dealProductController.removeProductFromDeal);

export default router;
