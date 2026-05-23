import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

/**
 * CRM CONTACT CLEANUP SCRIPT
 * Cleans all contacts from the database while preserving Users and Plans.
 */
async function main() {
  console.log("🧹 Iniciando limpieza de Contactos en Sentry CRM...");

  try {
    // 1. Clean Contacts
    // Note: This operation is safe as it doesn't touch 'User' or 'Plan' tables.
    // However, it will delete all CRM contact history.
    const result = await prisma.contact.deleteMany({});
    console.log(`✅ ${result.count} Contactos eliminados.`);

    // 2. Clean depending relations if needed (Tickets/Conversations are usually cleared by whatsapp cleanup)
    // But if we only run this, we might want to ensure orphans are handled if Cascade is not set.
    // In our schema, many relations to Contact are SetNull or Cascade.
    
    console.log("✨ LIMPIEZA DE CONTACTOS COMPLETADA.");
  } catch (err) {
    console.error("❌ Error al limpiar contactos:", err);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();
