import crypto from "crypto";
import { Logger } from "@/utils/logger";
import { getEnv } from "@/config/env";

/**
 * [SEC] ENTERPRISE CRYPTO UTILS — AES-256-GCM
 *
 * Features:
 * 1. Multi-tenant Key Derivation: Each namespace (sessionId/companyId) gets a unique key
 *    derived via scrypt from the master SESSION_SECRET.
 * 2. Key Rotation Support: Encrypted outputs are versioned (v1:IV:AuthTag:Ciphertext).
 *    If a PREVIOUS_SESSION_SECRET env var exists, decrypt will attempt it as fallback,
 *    enabling zero-downtime key rotation.
 * 3. Memory-Safe: Derived keys are zeroed from memory after use.
 * 4. Authenticated Encryption: GCM mode guarantees both confidentiality AND integrity.
 *    Any tampering with the ciphertext, IV, or auth tag causes immediate rejection.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_VERSION = "v1";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const KEY_LENGTH = 32; // 256-bit key

// ================= KEY DERIVATION =================

/**
 * Derives a cryptographic key for a specific namespace (Tenant Isolation).
 * Uses scrypt (memory-hard KDF) to prevent brute-force attacks on the master secret.
 */
const deriveKey = (namespace: string, secret?: string): Buffer => {
  const masterSecret = secret ?? getEnv().SESSION_SECRET;
  return crypto.scryptSync(masterSecret, namespace, KEY_LENGTH);
};

/**
 * Securely wipe a key buffer from memory after use.
 * Prevents key material from lingering in garbage-collected heap.
 */
const zeroKey = (key: Buffer): void => {
  key.fill(0);
};

// ================= ENCRYPT =================

/**
 * Encrypts plaintext with AES-256-GCM using a namespace-derived key.
 *
 * Output format: `v1:IV_hex:AuthTag_hex:Ciphertext_hex`
 *
 * @param text - The plaintext to encrypt.
 * @param namespace - Tenant/session identifier for key isolation (default: "global").
 * @returns Versioned, self-contained ciphertext string.
 */
export const encrypt = (text: string, namespace: string = "global"): string => {
  const key = deriveKey(namespace);

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Versioned format enables future algorithm migrations
    return `${KEY_VERSION}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  } finally {
    zeroKey(key);
  }
};

// ================= DECRYPT =================

/**
 * Decrypts AES-256-GCM ciphertext produced by `encrypt()`.
 *
 * Supports:
 * - v1 format: `v1:IV:AuthTag:Ciphertext` (current)
 * - Legacy format: `IV:AuthTag:Ciphertext` (backward-compatible)
 * - Key rotation: Falls back to PREVIOUS_SESSION_SECRET if primary key fails.
 *
 * @param text - The ciphertext to decrypt.
 * @param namespace - Tenant/session identifier for key isolation.
 * @returns Decrypted plaintext, or null if decryption fails.
 */
export const decrypt = (text: string, namespace: string = "global"): string | null => {
  // Determine format and extract components
  const parts = text.split(":");

  let ivHex: string;
  let authTagHex: string;
  let encryptedText: string;

  if (parts.length === 4 && parts[0] === KEY_VERSION) {
    // v1 format: version:iv:authTag:ciphertext
    [, ivHex, authTagHex, encryptedText] = parts;
  } else if (parts.length === 3) {
    // Legacy format: iv:authTag:ciphertext
    [ivHex, authTagHex, encryptedText] = parts;
  } else {
    return null;
  }

  // Attempt decryption with primary key
  const primaryResult = decryptWithSecret(ivHex, authTagHex, encryptedText, namespace);
  if (primaryResult !== null) return primaryResult;

  // [SEC] KEY ROTATION: Attempt decryption with previous secret if configured
  const previousSecret = process.env.PREVIOUS_SESSION_SECRET;
  if (previousSecret && previousSecret.length >= 32) {
    const fallbackResult = decryptWithSecret(
      ivHex,
      authTagHex,
      encryptedText,
      namespace,
      previousSecret,
    );

    if (fallbackResult !== null) {
      Logger.info(
        `[Crypto] Key rotation: Successfully decrypted with PREVIOUS_SESSION_SECRET for namespace ${namespace}. ` +
        `Re-encrypting with current key on next save.`,
      );
      return fallbackResult;
    }
  }

  Logger.warn(
    `[Crypto] Decryption failed for namespace ${namespace}. ` +
    `Possible mismatch in SESSION_SECRET or data corruption.`,
  );
  return null;
};

/**
 * Internal: Attempts decryption with a specific secret.
 */
const decryptWithSecret = (
  ivHex: string,
  authTagHex: string,
  encryptedText: string,
  namespace: string,
  secret?: string,
): string | null => {
  const key = deriveKey(namespace, secret);

  try {
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch {
    // Silently return null — caller handles logging and fallback logic
    return null;
  } finally {
    zeroKey(key);
  }
};

// ================= UTILITIES =================

/**
 * Generates a cryptographically secure random token.
 * Useful for API keys, CSRF tokens, nonces, etc.
 */
export const generateSecureToken = (lengthBytes: number = 32): string => {
  return crypto.randomBytes(lengthBytes).toString("hex");
};

/**
 * Constant-time string comparison to prevent timing attacks.
 * Use this instead of `===` when comparing secrets, tokens, or hashes.
 */
export const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return crypto.timingSafeEqual(bufA, bufB);
};


