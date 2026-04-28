import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import dotenv from "dotenv";
import { Logger } from "../src/utils/logger";

dotenv.config();

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

async function main() {
  Logger.info("🚀 INICIANDO SUPER LIMPIEZA (WhatsApp + Contactos + Shadow Users)...");

  try {
    // 1. WhatsApp & CRM Data Cleanup
    const tables = [
      "messageReaction",
      "message",
      "ticket",
      "conversation",
      "whatsAppCredential",
      "whatsAppSession",
      "contact",
    ];

    for (const table of tables) {
      try {
        // @ts-ignore
        const result = await prisma[table].deleteMany({});
        Logger.info(`✅ Tabla ${table} limpia (${result.count} registros eliminados)`);
      } catch (err: unknown) {
        Logger.warn(`⚠️ Error limpiando ${table}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 2. Shadow Users Cleanup (@whatsapp.user)
    const shadowUsers = await prisma.user.deleteMany({
      where: {
        email: { endsWith: "@whatsapp.user" }
      }
    });
    Logger.info(`✅ ${shadowUsers.count} Usuarios 'Shadow' de WhatsApp eliminados.`);

    // 3. Redis Cleanup
    Logger.info("🧹 Limpiando llaves wa:store:* en Redis...");
    const keys = await redis.keys("wa:store:*");
    if (keys.length > 0) {
      await redis.del(...keys);
      Logger.info(`✅ ${keys.length} llaves de Redis (Baileys store) eliminadas.`);
    } else {
      Logger.info("ℹ️ No se encontraron llaves de WhatsApp en Redis.");
    }

    Logger.info("✨ SUPER LIMPIEZA COMPLETADA. El sistema está en estado 0.");
  } catch (err) {
    Logger.error("❌ ERROR CRÍTICO DURANTE LA LIMPIEZA:", err);
  } finally {
    await prisma.$disconnect();
    redis.quit();
    process.exit(0);
  }
}

main();
