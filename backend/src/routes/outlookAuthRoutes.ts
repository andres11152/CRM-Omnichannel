import { Router } from "express";
import { outlookAuthController } from "@/controllers/outlookAuthController";
import { protect } from "@/middleware/authMiddleware";

const router = Router();

// Public routes for OAuth
router.get("/auth", outlookAuthController.getAuthUrl);
router.get("/callback", outlookAuthController.callback);

// Protected routes
router.use(protect);
router.get("/status", outlookAuthController.getStatus);
router.post("/disconnect", outlookAuthController.disconnect);

export default router;
