import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

/**
 * PURGE NON-SEED USERS
 *
 * Deja ÚNICAMENTE los usuarios creados por el seed (prisma/seed.ts) y borra el resto
 * (shadow users @whatsapp.user de chats, signups de prueba, etc.). Seguro de correr DESPUÉS
 * del wipe general (las tablas que referenciaban User ya están vacías).
 *
 * USO:
 *   npx ts-node scripts/purge_non_seed_users.ts          -> DRY RUN
 *   npx ts-node scripts/purge_non_seed_users.ts --apply  -> BORRA
 */

const APPLY = process.argv.includes("--apply");

// Emails creados por prisma/seed.ts — los únicos que se conservan.
const SEED_EMAILS = ["master@sentrycrm.cloud", "admin@sentrycrm.cloud"];

async function main() {
  const host = (process.env.DATABASE_URL || "").replace(/:[^:@/]*@/, ":****@");
  console.log(`🗄️  Target DB: ${host}`);
  console.log(`🧹 Modo: ${APPLY ? "APPLY (borra)" : "DRY RUN"}`);
  console.log(`✅ Se conservan SOLO: ${SEED_EMAILS.join(", ")}\n`);

  const total = await prisma.user.count();
  const seedUsers = await prisma.user.findMany({
    where: { email: { in: SEED_EMAILS } },
    select: { email: true, role: true, companyId: true },
  });
  const toDelete = total - seedUsers.length;

  console.log(`👥 Total usuarios: ${total}`);
  console.log(`🔒 Seed encontrados (se conservan): ${seedUsers.length}`);
  for (const u of seedUsers) console.log(`   - ${u.email} (${u.role})`);
  console.log(`❌ A borrar: ${toDelete}`);

  // Muestra usuarios "reales" (no shadow @whatsapp.user) que se van a borrar, por si
  // hubiera algún admin/agente creado a mano que no quieras perder.
  const realLikeToDelete = await prisma.user.findMany({
    where: {
      email: { notIn: SEED_EMAILS },
      NOT: { email: { endsWith: "@whatsapp.user" } },
    },
    select: { email: true, role: true },
    take: 50,
  });
  if (realLikeToDelete.length > 0) {
    console.log(`\n⚠️  No-shadow (¿reales?) que se borrarán (${realLikeToDelete.length} mostrados, máx 50):`);
    for (const u of realLikeToDelete) console.log(`   - ${u.email} (${u.role})`);
  }

  if (!APPLY) {
    console.log("\nℹ️  DRY RUN: no se borró nada. Ejecuta con --apply para aplicar.");
    return;
  }

  const res = await prisma.user.deleteMany({
    where: { email: { notIn: SEED_EMAILS } },
  });
  console.log(`\n✅ ${res.count} usuarios borrados. Quedan ${await prisma.user.count()} (solo seed).`);
}

main()
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
