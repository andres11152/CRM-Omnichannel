import { z } from "zod";

export const SubscribeCardSchema = z.object({
  body: z.object({
    token: z.string().min(1, "Card token is required"),
    planId: z.string().min(1, "Plan ID is required"),
    paymentMethodId: z.string().min(1, "Payment method ID is required"),
    issuerId: z.string().optional(),
  }),
});
