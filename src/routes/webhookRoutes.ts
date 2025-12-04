import { Router } from "express";
import { webhookController } from "@/controllers/webhookController";

const router = Router();

router.get("/", webhookController.getCompanyWebhooks);
router.post("/", webhookController.createWebhook);
router.delete("/:id", webhookController.deleteWebhook);
router.patch("/:id/toggle", webhookController.toggleWebhook);

export default router;
