import { Router } from "express";
import {
  createCheckoutSession,
  createPortalSession,
  subscribeCard,
  getPlans,
  mercadoPagoWebhook,
} from "@/controllers/paymentController";
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import {
  CreateCheckoutSessionSchema,
  CreatePortalSessionSchema,
} from "@/schemas/paymentSchemas";
import { SubscribeCardSchema } from "@/schemas/cardSchemas";

const router = Router();


// Endpoint secured with Auth and Zod Validation
router.post(
  "/create-checkout-session",
  protect,
  validate(CreateCheckoutSessionSchema),
  createCheckoutSession,
);

router.post(
  "/create-portal-session",
  protect,
  validate(CreatePortalSessionSchema),
  createPortalSession,
);

router.post(
  "/subscribe-card",
  protect,
  validate(SubscribeCardSchema),
  subscribeCard,
);

router.get(
  "/plans",
  protect,
  getPlans,
);

// We don't apply JSON body validation to MercadoPago Webhook here;
router.post("/webhook", mercadoPagoWebhook);

export default router;


