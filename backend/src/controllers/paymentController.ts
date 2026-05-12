import { Request, Response } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { stripeService } from "@/services/StripeService";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";

/**
 * PAYMENT CONTROLLER
 */

// POST /api/create-checkout-session
export const createCheckoutSession = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { priceId } = req.body;
    const companyId = req.companyId;
    const userEmail = req.user?.email;

    // priceId validation is now handled by Zod middleware.
    if (!companyId || !userEmail)
      throw new AppError("Incomplete user data", 400);

    const url = await stripeService.createCheckoutSession(
      companyId,
      priceId,
      userEmail,
    );

    res.status(200).json({ url });
  },
);

// POST /api/create-portal-session
export const createPortalSession = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId;
    if (!companyId) {
      throw new AppError("Company context not found.", 400);
    }

    // Logic to find customerId and create session is now encapsulated in the service.
    // The controller only needs to pass the companyId.
    const url = await stripeService.createPortalSession(companyId);

    res.status(200).json({ url });
  },
);

// POST /webhook/stripe
// Note: This route needs 'express.raw({type: "application/json"})' middleware in server.ts
export const stripeWebhook = catchAsync(async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string | string[] | undefined;

  await stripeService.handleWebhook(sig as string, req.body);

  res.json({ received: true });
});
