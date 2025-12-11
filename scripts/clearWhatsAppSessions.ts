import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function clearAllWhatsAppSessions() {
  try {
    console.log("🗑️  Eliminando todas las sesiones de WhatsApp...");

    // 1. Eliminar todas las credenciales de WhatsApp
    const deletedCreds = await prisma.whatsAppCredential.deleteMany({});
    console.log(`✅ Eliminadas ${deletedCreds.count} credenciales de WhatsApp`);

    // 2. Eliminar todas las sesiones de WhatsApp
    const deletedSessions = await prisma.whatsAppSession.deleteMany({});
    console.log(`✅ Eliminadas ${deletedSessions.count} sesiones de WhatsApp`);

    console.log("🎉 Todas las sesiones eliminadas correctamente");
  } catch (error) {
    console.error("❌ Error eliminando sesiones:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearAllWhatsAppSessions();
