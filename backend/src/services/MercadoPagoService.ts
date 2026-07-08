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
    } catch (error: unknown) {
      const err = error as { response?: { data?: unknown }; message?: string };
      Logger.error(`[MercadoPago] Card Subscription failed for company ${companyId}`, {
        error: err.response?.data || err.message || error,
      });
      throw new AppError("Error processing card payment subscription with MercadoPago.", 400);
    }
  },

  /**
   * Handles incoming notifications/IPN from MercadoPago.
   */
  async handleWebhook(payload: Record<string, unknown>): Promise<{ success: boolean }> {
    Logger.info("[MercadoPago] Received payment webhook notification", { payload });

    const { prisma: db } = await import("@/config/database");

    try {
      // 1. Process Merchant Order or Payment Notifications
      // MercadoPago webhooks can send different action types
      const action = payload.action as string;
      const type = payload.type as string;

      if (type === "subscription_preapproval" || action?.includes("subscription")) {
        const id = (payload.data as { id?: string })?.id;
        if (!id) return { success: true };

        Logger.info(`[MercadoPago] Processing subscription update for subscription ID: ${id}`);
        
        // Fetch subscription status directly from MercadoPago API
        const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || "TEST-MOCK-ACCESS-TOKEN";
        let subStatus = "authorized";
        let customerId = "";
        let planId = "";

        if (accessToken !== "TEST-MOCK-ACCESS-TOKEN") {
          const response = await axios.get(
            `https://api.mercadopago.com/v1/subscriptions/${id}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          subStatus = response.data.status;
          customerId = response.data.payer?.id;
          planId = response.data.plan_id;
        }

        // Find company by subscriptionId
        const company = await companyRepository.findUnique({
          where: { stripeSubscriptionId: id }
        });

        if (company) {
          let updatedStatus: "ACTIVE" | "OVERDUE" | "INACTIVE" = "ACTIVE";
          if (subStatus === "cancelled" || subStatus === "unauthorized") {
            updatedStatus = "INACTIVE";
          } else if (subStatus === "pending" || subStatus === "rejected") {
            updatedStatus = "OVERDUE";
          }

          Logger.info(`[MercadoPago] Updating company ${company.id} status to ${updatedStatus} based on sub: ${id}`);
          await companyRepository.update(company.id, {
            status: updatedStatus,
            isActive: updatedStatus === "ACTIVE"
          });
        }
      }

      if (type === "payment" || action === "payment.created" || action === "payment.updated") {
        const paymentId = (payload.data as { id?: string })?.id;
        if (!paymentId) return { success: true };

        const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || "TEST-MOCK-ACCESS-TOKEN";
        
        if (accessToken !== "TEST-MOCK-ACCESS-TOKEN") {
          // Fetch payment detail
          const paymentResponse = await axios.get(
            `https://api.mercadopago.com/v1/payments/${paymentId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          
          const status = paymentResponse.data.status;
          const amount = Math.round(paymentResponse.data.transaction_amount * 100); // cents
          const currency = paymentResponse.data.currency_id || "USD";
          const customerId = paymentResponse.data.payer?.id;

          if (customerId) {
            // Find company by MP Customer ID
            const company = await companyRepository.findUnique({
              where: { stripeCustomerId: customerId }
            });

            if (company) {
              const mappedStatus = status === "approved" ? "succeeded" : status === "rejected" ? "failed" : "pending";
              
              Logger.info(`[MercadoPago] Logging transaction for company ${company.id} (Payment: ${paymentId})`);
              
              // Register transaction log
              await db.billingTransaction.create({
                data: {
                  companyId: company.id,
                  description: `MercadoPago Subscription Payment - Ref: ${paymentId}`,
                  amount,
                  currency,
                  status: mappedStatus,
                  stripePaymentId: String(paymentId),
                  billingDate: new Date(),
                }
              });

              if (mappedStatus === "succeeded") {
                const nextBillingDate = new Date();
                nextBillingDate.setDate(nextBillingDate.getDate() + 30);

                await companyRepository.update(company.id, {
                  status: "ACTIVE",
                  isActive: true,
                  subscriptionEndsAt: nextBillingDate
                });
              } else if (mappedStatus === "failed") {
                await companyRepository.update(company.id, {
                  status: "OVERDUE"
                });
              }
            }
          }
        }
      }

      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      Logger.error(`[MercadoPago] Failed to parse webhook callback payload`, {
        error: errorMsg,
      });
      return { success: false };
    }
  }
};

