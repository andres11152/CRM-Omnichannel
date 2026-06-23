import { PrismaClient, Prisma } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

/**
 * RESET TO SEED — estado de cuenta recién sembrada.
 *
 * 1) Borra TODOS los datos excepto User, Plan, Company, Role, Permission, RolePermission.
 * 2) Borra todos los User EXCEPTO los del seed (master@ / admin@sentrycrm.cloud).
 *
 * ⚠️ DETÉN EL BACKEND ANTES DE CORRER ESTO. Si la app sigue viva, el socket de WhatsApp
 *    re-crea mensajes/conversaciones/shadow-users en vivo y el borrado falla por FK (P2003).
 *
 * USO:
 *   npx ts-node scripts/reset_to_seed.ts          -> DRY RUN
 *   npx ts-node scripts/reset_to_seed.ts --apply  -> RESETEA
 */

const APPLY = process.argv.includes("--apply");
const KEEP_TABLES = new Set(["User", "Plan", "Company", "Role", "Permission", "RolePermission"]);
const SEED_EMAILS = ["master@sentrycrm.cloud", "admin@sentrycrm.cloud"];

const delegateFor = (m: string) => m.charAt(0).toLowerCase() + m.slice(1);
const db = prisma as unknown as Record<
  string,
  { count: () => Promise<number>; deleteMany: (a: object) => Promise<{ count: number }> }
>;

async function main() {
  const host = (process.env.DATABASE_URL || "").replace(/:[^:@/]*@/, ":****@");
  console.log(`🗄️  Target DB: ${host}`);
  console.log(`🧹 Modo: ${APPLY ? "APPLY" : "DRY RUN"}\n`);

  const dataModels = Prisma.dmmf.datamodel.models
    .map((m) => m.name)
    .filter((n) => !KEEP_TABLES.has(n))
    .filter((m) => db[delegateFor(m)] && typeof db[delegateFor(m)].count === "function");

  // Resumen
  let grand = 0;
  for (const m of dataModels) {
    try { grand += await db[delegateFor(m)].count(); } catch { /* ignore */ }
  }
  const totalUsers = await prisma.user.count();
  const nonSeedUsers = totalUsers - (await prisma.user.count({ where: { email: { in: SEED_EMAILS } } }));
  console.log(`📊 Filas de datos a borrar: ${grand}`);
  console.log(`👥 Usuarios no-seed a borrar: ${nonSeedUsers} (de ${totalUsers})`);

  if (!APPLY) {
    console.log("\nℹ️  DRY RUN. Ejecuta con --apply (con el backend DETENIDO).");
    return;
  }

  // 1) WIPE de datos (multi-pass por FKs)
  console.log("\n🔥 [1/2] Borrando datos…");
  let remaining = [...dataModels];
  let pass = 0;
  while (remaining.length > 0) {
    pass++;
    const blocked: string[] = [];
    let progressed = false;
    for (const m of remaining) {
      try {
        const res = await db[delegateFor(m)].deleteMany({});
        if (res.count > 0) console.log(`  [p${pass}] ${m}: -${res.count}`);
        progressed = true;
      } catch { blocked.push(m); }
    }
    remaining = blocked;
    if (!progressed) {
      console.error(`❌ Bloqueado por FK: ${remaining.join(", ")}`);
      break;
    }
  }

  // 2) PURGE usuarios no-seed
  console.log("\n🔥 [2/2] Borrando usuarios no-seed…");
  const res = await prisma.user.deleteMany({ where: { email: { notIn: SEED_EMAILS } } });
  console.log(`  -${res.count} usuarios`);

  console.log(`\n✨ RESET COMPLETO. Usuarios restantes: ${await prisma.user.count()} (solo seed).`);
}

main()
  .catch((e) => { console.error("❌", e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
