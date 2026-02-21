import { Router } from "express";
import { productController } from "../controllers/productController";
import { protect } from "../middleware/authMiddleware";
import { validate } from "../middleware/validationMiddleware";
import {
  CreateProductSchema,
  UpdateProductSchema,
  ProductIdParamSchema,
} from "../schemas/product.schema";

const router = Router();

// Apply auth middleware to all routes
router.use(protect);

router.get("/", productController.getAllProducts);
router.post(
  "/",
  validate(CreateProductSchema),
  productController.createProduct,
);
router.put(
  "/:id",
  validate(UpdateProductSchema),
  productController.updateProduct,
);
router.delete(
  "/:id",
  validate(ProductIdParamSchema),
  productController.deleteProduct,
);

export default router;
