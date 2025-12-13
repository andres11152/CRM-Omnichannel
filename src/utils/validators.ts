import { z } from "zod";

/**
 * Validates a phone number ensures it contains only digits and is of plausible length (10-15 digits).
 */
export const phoneNumberSchema = z
  .string()
  .regex(/^\d{10,15}$/, "Invalid phone number format. Must be 10-15 digits.");

/**
 * Validates multiple phone numbers.
 */
export const phoneNumbersArraySchema = z.array(phoneNumberSchema);

export type ValidPhoneNumber = z.infer<typeof phoneNumberSchema>;
