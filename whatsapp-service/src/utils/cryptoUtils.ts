import crypto from "crypto";
import { Logger } from "./logger";

const ALGORITHM = "aes-256-gcm";
const KEY_VERSION = "v1";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const KEY_LENGTH = 32; // 256-bit key

const KEY_CACHE = new Map<string, Buffer>();

const deriveKey = (namespace: string, secret?: string): Buffer => {
  const masterSecret = secret ?? process.env.SESSION_SECRET ?? "change_me_in_production_session_secret";
  const cacheKey = `${namespace} ${masterSecret}`;
  let key = KEY_CACHE.get(cacheKey);
  if (!key) {
    key = crypto.scryptSync(masterSecret, namespace, KEY_LENGTH);
    KEY_CACHE.set(cacheKey, key);
  }
  return key;
};

/**
 * Encrypts plaintext with AES-256-GCM using a namespace-derived key.
 * Output format: `v1:IV_hex:AuthTag_hex:Ciphertext_hex`
 */
export const encrypt = (text: string, namespace: string = "global"): string => {
  const key = deriveKey(namespace);

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return `${KEY_VERSION}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
};

/**
 * Decrypts AES-256-GCM ciphertext produced by `encrypt()`.
 */
export const decrypt = (text: string, namespace: string = "global"): string | null => {
  const parts = text.split(":");

  let ivHex: string;
  let authTagHex: string;
  let encryptedText: string;

  if (parts.length === 4 && parts[0] === KEY_VERSION) {
    [, ivHex, authTagHex, encryptedText] = parts;
  } else if (parts.length === 3) {
    [ivHex, authTagHex, encryptedText] = parts;
  } else {
    return null;
  }

  const primaryResult = decryptWithSecret(ivHex, authTagHex, encryptedText, namespace);
  if (primaryResult !== null) return primaryResult;

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
        `[Crypto] Key rotation: Successfully decrypted with PREVIOUS_SESSION_SECRET for namespace ${namespace}.`
      );
      return fallbackResult;
    }
  }

  Logger.warn(
    `[Crypto] Decryption failed for namespace ${namespace}. Possible mismatch in SESSION_SECRET.`
  );
  return null;
};

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
    return null;
  }
};
