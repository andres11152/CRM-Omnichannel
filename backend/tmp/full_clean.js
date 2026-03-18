const { PrismaClient } = require("@prisma/client");
const Redis = require("ioredis");

const prisma = new PrismaClient();
const redis = new Redis(
  "rediss://red-d5tcv17gi27c73f4mlv0:BkoREMwe5LdKK9NExksIyvtuGaTb0w6c@oregon-keyvalue.render.com:6379",
);

async function main() {
  console.log("🧹 Iniciando limpieza completa...");
  try {
    console.log("🗑️ Eliminando Mensajes...");
    await prisma.message.deleteMany({});
    console.log("🗑️ Eliminando Tickets...");
    await prisma.ticket.deleteMany({});
    console.log("🗑️ Eliminando Conversaciones...");
    await prisma.conversation.deleteMany({});
    console.log("🗑️ Eliminando Credenciales WA...");
    await prisma.whatsAppCredential.deleteMany({});
    console.log("🗑️ Eliminando Sesiones WA...");
    await prisma.whatsAppSession.deleteMany({});

    console.log("🧹 Limpiando Redis...");
    const keys = await redis.keys("wa:store:*");
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`✅ ${keys.length} llaves de Redis borradas.`);
    } else {
      console.log("ℹ️ No se encontraron llaves de Redis.");
    }

    console.log("✨ LIMPIEZA TOTAL COMPLETADA.");
  } catch (error) {
    console.error("❌ ERROR:", error);
  } finally {
    await prisma.$disconnect();
    redis.quit();
    process.exit(0);
  }
}

main();
