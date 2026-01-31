import crypto from "crypto";

// Use a consistent key based on environment variable
// Ensure your SESSION_SECRET is strong and kept secret!
const SECRET_KEY =
  process.env.SESSION_SECRET ||
  "default-secret-key-must-be-changed-in-production-32chars";
const ALGORITHM = "aes-256-gcm";

// Derby a 32-byte key from the secret
const key = crypto.scryptSync(SECRET_KEY, "salt", 32);

export const encrypt = (text: string): string => {
  const iv = crypto.randomBytes(12); // Recommended 12 bytes for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Return IV:AuthTag:EncryptedData
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
};

export const decrypt = (text: string): string | null => {
  try {
    const parts = text.split(":");
    if (parts.length !== 3) {
      // Fallback: maybe it's not encrypted or legacy format
      return null;
    }

    const [ivHex, authTagHex, encryptedText] = parts;

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("[Crypto] Decryption failed:", error);
    return null;
  }
};
