import crypto from "crypto";
import { Logger } from "@/utils/logger";

/**
 * [AUTH] ADVANCED CRYPTO UTILS (Audit Hardened)
 * 
 * Implements Multi-tenant Encryption Scoping.
 * Each company/session gets a UNIQUE derived key.
 */

import { getEnv } from "@/config/env";

const ALGORITHM = "aes-256-gcm";

/**
 * Derives a key for a specific namespace (Tenant Isolation)
 */
const deriveKey = (namespace: string): Buffer => {
  // [SEC] SECURITY: getEnv() ensures strict validation and 32-char minimum via Zod
  const secret = getEnv().SESSION_SECRET;
  // We use the namespace (companyId/sessionId) as the salt
  return crypto.scryptSync(secret, namespace, 32);
};

export const encrypt = (text: string, namespace: string = "global"): string => {
  const key = deriveKey(namespace);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Return IV:AuthTag:EncryptedData
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
};

export const decrypt = (text: string, namespace: string = "global"): string | null => {
  try {
    const parts = text.split(":");
    if (parts.length !== 3) return null;

    const [ivHex, authTagHex, encryptedText] = parts;
    const key = deriveKey(namespace);
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    const isAuthenticityError =
      error instanceof Error &&
      error.message.includes("unable to authenticate data");
    
    if (isAuthenticityError) {
      Logger.warn(
        `[Crypto] Authentication failed for namespace ${namespace}. ` +
        `Possible mismatch in SESSION_SECRET or data corruption.`
      );
    } else {
      Logger.error(`[Crypto] Decryption error [${namespace}]:`, error);
    }
    return null;
  }
};

