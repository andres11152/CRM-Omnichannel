const { PrismaClient } = require("c:/Users/Andres Betancourt/Desktop/Desarrollos Personales/Reply/Proyecto/backend/node_modules/@prisma/client");
const prisma = new PrismaClient();
const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const KEY_VERSION = "v1";
const KEY_LENGTH = 32;

// Replicate decrypt logic from cryptoUtils.ts
const deriveKey = (namespace, secret) => {
  const masterSecret = secret || process.env.SESSION_SECRET || "CRM-Omnichannel-Default-Secret-Key-Ensure-Change-In-Prod!";
  return crypto.scryptSync(masterSecret, namespace, KEY_LENGTH);
};

const decryptWithSecret = (ivHex, authTagHex, encryptedText, namespace, secret) => {
  const key = deriveKey(namespace, secret);
  try {
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (e) {
    return null;
  }
};

const decrypt = (text, namespace) => {
  const parts = text.split(":");
  let ivHex, authTagHex, encryptedText;
  if (parts.length === 4 && parts[0] === KEY_VERSION) {
    [, ivHex, authTagHex, encryptedText] = parts;
  } else if (parts.length === 3) {
    [ivHex, authTagHex, encryptedText] = parts;
  } else {
    return null;
  }
  return decryptWithSecret(ivHex, authTagHex, encryptedText, namespace);
};

async function main() {
  console.log("SESSION_SECRET in env:", process.env.SESSION_SECRET ? "Present" : "Missing/Fallback");
  const creds = await prisma.whatsAppCredential.findMany({});
  console.log(`Found ${creds.length} total credentials.`);

  let failCount = 0;
  for (const cred of creds) {
    const decrypted = decrypt(cred.value, cred.sessionId);
    if (!decrypted) {
      // Check if it's plaintext
      if (!cred.value.includes(":")) {
        console.log(`[PLAINTEXT] Key: ${cred.key} for Session: ${cred.sessionId}`);
      } else {
        console.log(`[DECRYPT FAIL] Key: ${cred.key} for Session: ${cred.sessionId}`);
        failCount++;
      }
    }
  }
  console.log(`Decryption test finished. Failures: ${failCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
