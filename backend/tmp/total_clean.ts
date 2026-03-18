
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL as string);

async function main() {
  console.log("🧹 Iniciando limpieza de WhatsApp (DB + Redis)...");
  
  try {
    // DB Cleanup (redundant but safe)
    const tables = ["messageReaction", "message", "ticket", "whatsAppSession", "whatsAppCredential", "conversation"];
    for (const table of tables) {
      // @ts-ignore
      await prisma[table].deleteMany({});
      console.log(`✅ Table ${table} cleared`);
    }

    // Redis Cleanup
    console.log("🧹 Limpiando llaves wa:store:* en Redis...");
    const keys = await redis.keys("wa:store:*");
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`✅ ${keys.length} keys deleted from Redis`);
    } else {
      console.log("ℹ️ No keys found in Redis");
    }

    console.log("✨ LIMPIEZA COMPLETADA.");
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await prisma.$disconnect();
    redis.quit();
    process.exit(0);
  }
}

main();
