import { z } from "zod";

export const CreateCheckoutSessionSchema = z.object({
  body: z.object({
    priceId: z
      .string()
      .min(1, "Plan/Price ID is required"),
  }),
});

export const CreatePortalSessionSchema = z.object({
  // No body requirements for now based on the controller,
  // but acts as an enforcement layer if they add things here later.
  body: z.object({}).optional(),
});
