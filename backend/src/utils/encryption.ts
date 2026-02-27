import crypto from "crypto";
import { Logger } from "@/utils/logger";

const ALGORITHM = "aes-256-cbc";
// Usar una clave fija derivada del JWT_SECRET o una variable de entorno específica
// Fallback seguro para desarrollo si no hay ENV
const ENCRYPTION_KEY = crypto.scryptSync(
  process.env.JWT_SECRET || "secret-fallback-key-do-not-use-prod",
  "salt",
  32,
);
const IV_LENGTH = 16;

export const encrypt = (text: string): string => {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
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
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    // Si falla la desencriptación, devolver texto original o string vacío para no romper la app
    Logger.error("[Encryption] Failed to decrypt value", error);
    return text;
  }
};
