import { z } from "zod";

export const CreateCheckoutSessionSchema = z.object({
  body: z.object({
    priceId: z
      .string()
      .min(5, "Invalid price ID format")
      .regex(
        /^price_[a-zA-Z0-9]+$/,
        "Price ID must be a valid Stripe price ID",
      ),
  }),
});

export const CreatePortalSessionSchema = z.object({
  // No body requirements for now based on the controller,
  // but acts as an enforcement layer if they add things here later.
  body: z.object({}).optional(),
});
