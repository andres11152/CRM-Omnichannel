import Stripe from "stripe";
import { companyRepository } from "@/repositories/CompanyRepository";
import { AppError } from "@/utils/AppError";

/**
 * STRIPE SERVICE
 * Handles all payment-related logic.
 */

// Initialize Stripe with Secret Key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_mock_key", {
  apiVersion: "2025-02-24.acacia", // Latest API version
});

export const stripeService = {
  /**
   * Finds or creates a Stripe Customer ID for a given company.
   * @param companyId The ID of the company in our database.
   * @param userEmail The email of the user, used if a new customer needs to be created.
   * @returns The Stripe Customer ID.
   */
  async findOrCreateStripeCustomerId(
    companyId: string,
    userEmail: string,
  ): Promise<string> {
    const company = await companyRepository.findById(companyId);
    if (!company) throw new AppError("Company not found.", 404);

    if (company.stripeCustomerId) {
      return company.stripeCustomerId;
    }

    // If it doesn't exist, create a new customer in Stripe
    const customer = await stripe.customers.create({
      email: userEmail,
      name: company.name,
      metadata: { companyId: company.id },
    });

    // Save new ID in our database
    await companyRepository.update(companyId, {
      stripeCustomerId: customer.id,
    });

    return customer.id;
  },

  async createCheckoutSession(
    companyId: string,
    priceId: string,
    userEmail: string,
  ): Promise<string> {
    const customerId = await this.findOrCreateStripeCustomerId(
      companyId,
      userEmail,
    );
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      customer: customerId, // Use correct customer ID
      metadata: { companyId },
      success_url: `${process.env.FRONTEND_URL}/?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/?canceled=true`,
    });
    return session.url!;
  },

  async createPortalSession(companyId: string): Promise<string> {
    const company = await companyRepository.findById(companyId);
    if (!company || !company.stripeCustomerId) {
      throw new AppError(
        "Stripe Customer ID not found for this company.",
        404,
      );
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: company.stripeCustomerId, // Use correct customer ID
      return_url: process.env.FRONTEND_URL || "http://localhost:5173",
    });
    return session.url!;
  },

  async handleWebhook(signature: string, rawBody: Buffer | string) {
    // ... (webhook logic remains the same)
    stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
    // ...
  },
};
