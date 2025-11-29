import { Router } from "express";
import { webhookController } from "@/controllers/webhookController";
import { protect } from "@/middleware/authMiddleware";

const router = Router();

router.get("/:companyId", protect, webhookController.getCompanyWebhooks);

export default router;
