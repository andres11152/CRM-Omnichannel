import crypto from "crypto";
import { getEnv } from "@/config/env";

/**
 * Stateless, unguessable unsubscribe link: HMAC(companyId:contactId) instead
 * of a stored per-contact token — no migration, no expiry bookkeeping, and
 * the link keeps working even if the contact is re-synced from WhatsApp.
 */
export function generateUnsubscribeToken(companyId: string, contactId: string): string {
  const secret = getEnv().SESSION_SECRET;
  return crypto
    .createHmac("sha256", secret)
    .update(`${companyId}:${contactId}`)
    .digest("hex");
}

export function verifyUnsubscribeToken(
  companyId: string,
  contactId: string,
  token: string,
): boolean {
  const expected = generateUnsubscribeToken(companyId, contactId);
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(token, "hex");
  return (
    expectedBuf.length === providedBuf.length &&
    crypto.timingSafeEqual(expectedBuf, providedBuf)
  );
}
