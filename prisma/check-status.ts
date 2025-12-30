import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkStatus() {
  console.log("🔍 VERIFICANDO ESTADO ACTUAL...\n");

  const sessions = await prisma.whatsAppSession.findMany();
  const users = await prisma.user.findMany();
  const conversations = await prisma.conversation.findMany();
  const messages = await prisma.message.findMany();

  console.log("📊 RESUMEN:");
  console.log(`- Sesiones WhatsApp: ${sessions.length}`);
  console.log(`- Usuarios: ${users.length}`);
  console.log(`- Conversaciones: ${conversations.length}`);
  console.log(`- Mensajes: ${messages.length}\n`);

  console.log("📱 SESIONES WHATSAPP:");
  sessions.forEach((s) => {
    console.log(
      `  • ${s.sessionId} - ${s.status} - ${s.phone || "Sin teléfono"}`
    );
  });

  console.log("\n👤 USUARIOS:");
  users.forEach((u) => {
    console.log(`  • ${u.email} - ${u.role} - ${u.name}`);
  });
}

checkStatus()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
