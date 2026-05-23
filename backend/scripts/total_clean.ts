import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import * as dotenv from "dotenv";
import { Logger } from "../src/utils/logger";

dotenv.config();

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL as string);

async function main() {
  Logger.info("🧹 Iniciando limpieza de WhatsApp (DB + Redis)...");

  try {
    // DB Cleanup (redundant but safe)
    const tables = [
      "messageReaction",
      "message",
      "ticket",
      "whatsAppSession",
      "whatsAppCredential",
      "conversation",
    ];
    for (const table of tables) {
      // @ts-ignore
      await prisma[table].deleteMany({});
      Logger.info(`✅ Table ${table} cleared`);
    }

    // Redis Cleanup
    Logger.info("🧹 Limpiando llaves wa:store:* en Redis...");
    const keys = await redis.keys("wa:store:*");
    if (keys.length > 0) {
      await redis.del(...keys);
      Logger.info(`✅ ${keys.length} keys deleted from Redis`);
    } else {
      Logger.info("ℹ️ No keys found in Redis");
    }

    Logger.info("✨ LIMPIEZA COMPLETADA.");
  } catch (err) {
    Logger.error("❌ Error:", err);
  } finally {
    await prisma.$disconnect();
    redis.quit();
    process.exit(0);
  }
}

main();
