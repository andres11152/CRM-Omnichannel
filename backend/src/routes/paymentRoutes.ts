import { Router } from "express";
import {
  createCheckoutSession,
  createPortalSession,
  stripeWebhook,
} from "@/controllers/paymentController";
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import {
  CreateCheckoutSessionSchema,
  CreatePortalSessionSchema,
} from "@/schemas/paymentSchemas";

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

// We don't apply JSON body validation to Stripe Webhook here;
// it uses express.raw() at the global app level to verify the signature.
router.post("/webhook", stripeWebhook);

export default router;
