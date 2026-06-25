import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

/**
 * Reporta versiones de Postgres y Redis de la conexión configurada en .env,
 * para comparar paridad local vs Render. Solo-lectura.
 */
async function main() {
  const dbUrl = process.env.DATABASE_URL || "";
  const redisUrl = process.env.REDIS_URL || "";
  const host = dbUrl.includes("render.com") ? "RENDER" : "LOCAL/OTRO";

  console.log(`\n🎯 Apuntando a: ${host}`);
  console.log(`   DB host:    ${dbUrl.replace(/:\/\/[^@]*@/, "://***@").split("?")[0]}`);
  console.log(`   Redis host: ${redisUrl.replace(/:\/\/[^@]*@/, "://***@")}`);

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe<{ version: string }[]>("SELECT version()");
    console.log(`\n🐘 Postgres: ${rows[0]?.version}`);
  } catch (e) {
    console.log(`🐘 Postgres: error -> ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await prisma.$disconnect();
  }

  if (redisUrl) {
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
    try {
      await redis.connect();
      const info = await redis.info("server");
      const ver = /redis_version:([^\r\n]+)/.exec(info)?.[1];
      const mem = await redis.info("memory");
      const maxmem = /maxmemory_human:([^\r\n]+)/.exec(mem)?.[1];
      const policy = /maxmemory_policy:([^\r\n]+)/.exec(mem)?.[1];
      console.log(`🔺 Redis: ${ver} | maxmemory: ${maxmem} | policy: ${policy}`);
    } catch (e) {
      console.log(`🔺 Redis: error -> ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      redis.disconnect();
    }
  }
  console.log("");
}

main();
