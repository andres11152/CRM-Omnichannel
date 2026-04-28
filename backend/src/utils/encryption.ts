import crypto from "crypto";
import { Logger } from "@/utils/logger";
import { getEnv } from "@/config/env";

const ALGORITHM = "aes-256-cbc";

/**
 * [SEC] SECURITY FIX: Use standardized getEnv() and SESSION_SECRET
 * Derives a consistent key for internal data encryption.
 */
const getEncryptionKey = (): Buffer => {
  const secret = getEnv().SESSION_SECRET;
  // Use a fixed salt for internal encryption to keep keys stable
  return crypto.scryptSync(secret, "reply-internal-salt", 32);
};

const IV_LENGTH = 16;

export const encrypt = (text: string): string => {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
};

export const decrypt = (text: string): string => {
  if (!text) return text;
  // Si el texto no tiene el formato iv:content, asumimos que no está encriptado (legacy data support)
  if (!text.includes(":")) return text;

  try {
    const textParts = text.split(":");
    const iv = Buffer.from(textParts.shift()!, "hex");
    const encryptedText = Buffer.from(textParts.join(":"), "hex");
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    // Si falla la desencriptación, devolver texto original o string vacío para no romper la app
    Logger.error("[Encryption] Failed to decrypt value", error);
    return text;
  }
};
