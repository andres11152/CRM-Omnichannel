import { Router } from "express";
import { googleAuthController } from "@/controllers/googleAuthController";
import { protect } from "@/middleware/authMiddleware";

const router = Router();

// OAuth flow routes (auth is public but needs userId in query)
router.get("/auth", googleAuthController.initiateAuth);
router.get("/callback", googleAuthController.handleCallback);

// Management routes (need authentication)
router.post("/disconnect", protect, googleAuthController.disconnect);
router.get("/status", protect, googleAuthController.status);

export default router;
