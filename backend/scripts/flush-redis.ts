import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

const cleanRedis = async () => {
  console.log("🧹 Iniciando limpieza total de Redis...");

  if (!process.env.REDIS_URL) {
    console.error("❌ ERROR: REDIS_URL no definida en .env");
    process.exit(1);
  }

  const client = createClient({
    url: process.env.REDIS_URL,
    socket: {
      tls: true,
      rejectUnauthorized: false,
    },
  });

  client.on("error", (err) => console.error("Redis Client Error", err));

  try {
    await client.connect();
    console.log("✅ Conectado a Redis.");

    const info = await client.info("memory");
    console.log(
      "📊 Estado de memoria ANTES:",
      info.split("\n").find((l) => l.includes("used_memory_human")),
    );

    console.log("🔥 Ejecutando FLUSHALL...");
    await client.flushAll();

    console.log("✅ Redis limpiado completamente.");

    const infoAfter = await client.info("memory");
    console.log(
      "📊 Estado de memoria DESPUÉS:",
      infoAfter.split("\n").find((l) => l.includes("used_memory_human")),
    );
  } catch (error) {
    console.error("❌ Error durante la limpieza:", error);
  } finally {
    await client.disconnect();
    console.log("👋 Desconectado.");
    process.exit(0);
  }
};

cleanRedis();
