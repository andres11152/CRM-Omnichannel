import { Request, Response } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { mercadoPagoService } from "@/services/MercadoPagoService";
import { planRepository } from "@/repositories/PlanRepository";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";


/**
 * PAYMENT CONTROLLER (MERCADOPAGO)
 */

// POST /api/payments/create-checkout-session (Refactored to MercadoPago)
export const createCheckoutSession = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { priceId } = req.body; // In MercadoPago, this maps to the Plan ID / Plan key
    const companyId = req.companyId;
    const userEmail = req.user?.email;

    if (!companyId || !userEmail) {
      throw new AppError("Incomplete user data", 400);
    }

    const url = await mercadoPagoService.createCheckoutPreference(
      companyId,
      priceId,
      userEmail,
    );

    res.status(200).json({ url });
  },
);

// POST /api/payments/create-portal-session (MercadoPago Subscription Redirect Stub)
export const createPortalSession = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    // MercadoPago doesn't have a direct equivalent to Stripe Portal.
    // We redirect to MercadoPago's general user dashboard.
    const url = "https://www.mercadopago.com.co/subscriptions";
    res.status(200).json({ url });
  },
);

// POST /api/payments/subscribe-card (Direct Card Tokenized Subscription)
export const subscribeCard = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { token, planId, paymentMethodId, issuerId } = req.body;
    const companyId = req.companyId;
    const userEmail = req.user?.email;

    if (!companyId || !userEmail) {
      throw new AppError("Incomplete user data", 400);
    }

    const subscription = await mercadoPagoService.subscribeWithCard(
      companyId,
      planId,
      userEmail,
      { token, paymentMethodId, issuerId },
    );

    res.status(200).json({
      success: true,
      message: "Subscription created successfully",
      subscription,
    });
  },
);

// GET /api/payments/plans (Retrieve list of subscription plans for UI)
export const getPlans = catchAsync(async (req: Request, res: Response) => {
  const plans = await planRepository.findMany();
  res.status(200).json({ success: true, data: plans });
});

// POST /api/payments/webhook (MercadoPago Webhook/IPN Receiver)
export const mercadoPagoWebhook = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  await mercadoPagoService.handleWebhook(payload);
  res.json({ received: true });
});


