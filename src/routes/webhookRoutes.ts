import { Router } from "express";
import { webhookController } from "@/controllers/webhookController";
import { protect } from "@/middleware/authMiddleware";

const router = Router();

router.get("/", protect, webhookController.getCompanyWebhooks);
router.post("/", protect, webhookController.createWebhook);

export default router;
