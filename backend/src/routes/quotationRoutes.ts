import { Router } from "express";
import { quotationController } from "../controllers/QuotationController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

// Public routes for client approval / viewing
router.get("/public/:hash", quotationController.getPublicByHash);
router.post("/public/:hash/respond", quotationController.respondPublic);

// Authenticated tenant routes
router.use(protect);

router.get("/", quotationController.getAll);
router.post("/", quotationController.create);
router.get("/:id", quotationController.getById);
router.get("/:id/html", quotationController.getHtmlPreview);
router.patch("/:id/status", quotationController.updateStatus);

export default router;
