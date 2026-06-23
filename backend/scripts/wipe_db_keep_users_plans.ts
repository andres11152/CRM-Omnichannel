import { PrismaClient, Prisma } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

/**
 * CLEAN SLATE WIPE
 *
 * Borra TODOS los datos de la base de datos EXCEPTO las tablas esenciales para que
 * los usuarios sigan existiendo y pudiendo iniciar sesión:
 *   - User, Plan, Company (User.companyId es onDelete:Cascade → borrar Company borraría
 *     los usuarios), Role / Permission / RolePermission (RBAC).
 *
 * Estrategia multi-pass: intenta deleteMany en cada modelo; los que fallan por FK
 * (hijos aún presentes) se reintentan en la siguiente pasada hasta vaciar todo.
 *
 * USO:
 *   npx ts-node scripts/wipe_db_keep_users_plans.ts          -> DRY RUN (solo cuenta filas)
 *   npx ts-node scripts/wipe_db_keep_users_plans.ts --apply  -> BORRA de verdad
 */

const APPLY = process.argv.includes("--apply");

// Modelos (nombres PascalCase del schema) que se CONSERVAN.
const KEEP = new Set([
  "User",
  "Plan",
  "Company",
  "Role",
  "Permission",
  "RolePermission",
]);

const delegateFor = (modelName: string) =>
  modelName.charAt(0).toLowerCase() + modelName.slice(1);

const db = prisma as unknown as Record<
  string,
  {
    count: () => Promise<number>;
    deleteMany: (a: object) => Promise<{ count: number }>;
  }
>;

async function main() {
  const host = (process.env.DATABASE_URL || "").replace(/:[^:@/]*@/, ":****@");
  console.log(`🗄️  Target DB: ${host}`);
  console.log(`🧹 Modo: ${APPLY ? "APPLY (borra)" : "DRY RUN (solo cuenta)"}`);
  console.log(`✅ Se CONSERVAN: ${[...KEEP].join(", ")}\n`);

  const allModels = Prisma.dmmf.datamodel.models
    .map((m) => m.name)
    .filter((n) => !KEEP.has(n));

  // Verifica que cada delegate exista en el client (evita typos de naming).
  const toDelete = allModels.filter((m) => {
    const d = delegateFor(m);
    return db[d] && typeof db[d].count === "function";
  });
  const skippedNames = allModels.filter((m) => !toDelete.includes(m));
  if (skippedNames.length) {
    console.log(`⚠️  Sin delegate (se ignoran): ${skippedNames.join(", ")}\n`);
  }

  // ── DRY RUN: contar filas ──
  let grand = 0;
  console.log("=== Filas a borrar por modelo ===");
  for (const m of toDelete) {
    const d = delegateFor(m);
    try {
      const c = await db[d].count();
      if (c > 0) console.log(`  ${m}: ${c}`);
      grand += c;
    } catch (e) {
      console.log(`  ${m}: (error al contar: ${(e as Error).message.split("\n")[0]})`);
    }
  }
  console.log(`\n📊 TOTAL filas a borrar: ${grand}`);

  if (!APPLY) {
    console.log("\nℹ️  DRY RUN: no se borró nada. Ejecuta con --apply para borrar.");
    return;
  }

  // ── APPLY: multi-pass deleteMany ──
  console.log("\n🔥 Borrando…");
  let remaining = [...toDelete];
  let pass = 0;
  while (remaining.length > 0) {
    pass++;
    const stillBlocked: string[] = [];
    let progressed = false;

    for (const m of remaining) {
      const d = delegateFor(m);
      try {
        const res = await db[d].deleteMany({});
        if (res.count > 0) console.log(`  [pass ${pass}] ${m}: -${res.count}`);
        progressed = true;
      } catch (e) {
        // FK constraint (hijos aún presentes) → reintentar en siguiente pasada
        stillBlocked.push(m);
        if (pass > 1) {
          // log solo a partir de la 2da pasada para no ensuciar
        }
        void e;
      }
    }

    remaining = stillBlocked;
    if (!progressed) {
      console.error(
        `\n❌ Sin progreso en pass ${pass}. Modelos bloqueados por FK: ${remaining.join(", ")}`,
      );
      console.error("   Revisa relaciones onDelete o bórralos manualmente.");
      break;
    }
  }

  if (remaining.length === 0) {
    console.log("\n✨ LIMPIEZA COMPLETA. Solo quedan Users, Plans, Company y RBAC.");
  }
}

main()
  .catch((err) => {
    console.error("❌ Error fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
