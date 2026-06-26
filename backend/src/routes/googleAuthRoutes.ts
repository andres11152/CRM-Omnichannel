import { Router } from "express";
import { googleAuthController } from "@/controllers/googleAuthController";
import { protect } from "@/middleware/authMiddleware";

const router = Router();

// OAuth flow routes
router.get("/auth", googleAuthController.initiateAuth); // login flow (público)
router.get("/callback", googleAuthController.handleCallback);

// Management routes (need authentication)
router.get("/auth-url", protect, googleAuthController.getAuthUrl); // calendar connect (Bearer)
router.post("/disconnect", protect, googleAuthController.disconnect);
router.get("/status", protect, googleAuthController.status);

export default router;
