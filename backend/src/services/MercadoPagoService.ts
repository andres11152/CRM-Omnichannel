import { companyRepository } from "@/repositories/CompanyRepository";
import { planRepository } from "@/repositories/PlanRepository";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import axios from "axios";

/**
 * MERCADOPAGO SERVICE
 * Handles payment preferences, IPN/webhooks, and direct card subscriptions for CRM.
 */
export const mercadoPagoService = {
  /**
   * Creates a checkout preference link to redirect users for MercadoPago payments.
   */
  async createCheckoutPreference(
    companyId: string,
    planId: string,
    userEmail: string,
  ): Promise<string> {
    const company = await companyRepository.findById(companyId);
    if (!company) throw new AppError("Company not found.", 404);

    Logger.info(`[MercadoPago] Generating checkout preference for company ${companyId} (Plan: ${planId})`);
    
    // Mock URL for visual redirection/sandbox testing.
    const sandboxPreferenceUrl = `https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=mp_mock_pref_${companyId.slice(-6)}_${planId.slice(-6)}`;
    return sandboxPreferenceUrl;
  },

  /**
   * Subscribes a customer using a tokenized card directly.
   * This is Option A: PCI-DSS compliant custom checkout.
   */
  async subscribeWithCard(
    companyId: string,
    planId: string,
    userEmail: string,
    cardData: { token: string; paymentMethodId: string; issuerId?: string },
  ): Promise<{ subscriptionId: string; status: string }> {
    const company = await companyRepository.findById(companyId);
    if (!company) throw new AppError("Company not found.", 404);

    const plan = await planRepository.findUnique({ where: { id: planId } });
    if (!plan) throw new AppError("Subscription plan not found.", 404);

    Logger.info(`[MercadoPago] Initiating direct card subscription for company ${companyId} on Plan ${planId}`);

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || "TEST-MOCK-ACCESS-TOKEN";

    try {
      let customerId = company.stripeCustomerId; // Reused database column for payment customer reference

      // 1. Create MercadoPago Customer if not exists
      if (!customerId) {
        Logger.info(`[MercadoPago] Creating customer for company ${companyId} (${userEmail})`);
        
        // In sandbox/production, make a POST to /v1/customers
        // We will perform a mock call if access token is mock, or real request if token is configured.
        if (accessToken === "TEST-MOCK-ACCESS-TOKEN") {
          customerId = `mp_cust_${Math.random().toString(36).substring(7)}`;
        } else {
          const customerResponse = await axios.post(
            "https://api.mercadopago.com/v1/customers",
            { email: userEmail, first_name: company.name },
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          customerId = customerResponse.data.id;
        }

        await companyRepository.update(companyId, { stripeCustomerId: customerId });
      }

      // 2. Associate Card token with Customer
      Logger.info(`[MercadoPago] Associating card token ${cardData.token} to customer ${customerId}`);
      if (accessToken !== "TEST-MOCK-ACCESS-TOKEN") {
        await axios.post(
          `https://api.mercadopago.com/v1/customers/${customerId}/cards`,
          { token: cardData.token },
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
      }

      // 3. Create Subscription
      Logger.info(`[MercadoPago] Creating subscription for customer ${customerId} to plan ${planId}`);
      let subscriptionId = `mp_sub_${Math.random().toString(36).substring(7)}`;
      let status = "authorized";

      if (accessToken !== "TEST-MOCK-ACCESS-TOKEN") {
        const subResponse = await axios.post(
          "https://api.mercadopago.com/v1/subscriptions",
          {
            plan_id: planId, // Expects predefined MercadoPago subscription plan id
            payer: { id: customerId },
            card_token_id: cardData.token,
          },
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        subscriptionId = subResponse.data.id;
        status = subResponse.data.status;
      }

      // 4. Update local DB subscription state
      const nextBillingDate = new Date();
      nextBillingDate.setDate(nextBillingDate.getDate() + 30);

      await companyRepository.update(companyId, {
        planId: plan.id,
        stripeSubscriptionId: subscriptionId,
        subscriptionEndsAt: nextBillingDate,
        status: "ACTIVE",
      });

      Logger.info(`[MercadoPago] Subscription successful for company ${companyId}. SubId: ${subscriptionId}`);
      return { subscriptionId, status };
    } catch (error: any) {
      Logger.error(`[MercadoPago] Card Subscription failed for company ${companyId}`, {
        error: error.response?.data || error.message || error,
      });
      throw new AppError("Error processing card payment subscription with MercadoPago.", 400);
    }
  },

  /**
   * Handles incoming notifications/IPN from MercadoPago.
   */
  async handleWebhook(payload: Record<string, unknown>): Promise<{ success: boolean }> {
    Logger.info("[MercadoPago] Received payment webhook notification", { payload });
    // Process payment updates (success, pending, rejected)
    return { success: true };
  }
};

