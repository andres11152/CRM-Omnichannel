import { Router } from "express";
import { productController } from "../controllers/productController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

// Apply auth middleware to all routes
router.use(protect);

router.get("/", productController.getAllProducts);
router.post("/", productController.createProduct);
router.put("/:id", productController.updateProduct);
router.delete("/:id", productController.deleteProduct);

export default router;
