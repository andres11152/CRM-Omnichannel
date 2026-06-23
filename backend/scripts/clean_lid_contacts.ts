import { PrismaClient } from "@prisma/client";
import { isValidPhoneNumber } from "libphonenumber-js";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

/**
 * LID CONTACT CLEANUP
 *
 * Elimina ÚNICAMENTE los contactos cuyo `phone` es un LID / identificador interno
 * de WhatsApp (no valida como número real E.164 según libphonenumber). Conserva los
 * contactos con números reales de cualquier país. Misma regla que
 * WhatsAppIdUtils.isValidCrmPhone, para mantener consistencia.
 *
 * Además pone en NULL el `phone` de los shadow users (@whatsapp.user) que tengan un
 * LID guardado, para que el botón "Importar WhatsApp" no los vuelva a importar.
 *
 * USO:
 *   npx ts-node scripts/clean_lid_contacts.ts          -> DRY RUN (no borra, solo reporta)
 *   npx ts-node scripts/clean_lid_contacts.ts --apply  -> aplica los cambios
 */

const APPLY = process.argv.includes("--apply");

function isRealPhone(value: string | null | undefined): boolean {
  if (!value) return false;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 13) return false;
  try {
    return isValidPhoneNumber(`+${digits}`);
  } catch {
    return false;
  }
}

async function main() {
  console.log(`🧹 Limpieza de contactos LID — modo: ${APPLY ? "APLICAR" : "DRY RUN"}`);

  const contacts = await prisma.contact.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, phone: true, companyId: true },
  });

  const lidContacts = contacts.filter((c) => !isRealPhone(c.phone));

  console.log(`\n📊 Total contactos: ${contacts.length}`);
  console.log(`❌ Contactos LID/ inválidos a eliminar: ${lidContacts.length}`);
  console.log(`✅ Contactos reales que se conservan: ${contacts.length - lidContacts.length}\n`);

  for (const c of lidContacts) {
    console.log(`   - [${c.companyId}] ${c.name ?? "(sin nombre)"} | ${c.phone}`);
  }

  // Shadow users con LID en phone (para que no se re-importen)
  const shadowUsers = await prisma.user.findMany({
    where: { role: "USER", email: { endsWith: "@whatsapp.user" }, phone: { not: null } },
    select: { id: true, phone: true },
  });
  const lidUsers = shadowUsers.filter((u) => !isRealPhone(u.phone));
  console.log(`\n👤 Shadow users con LID en phone (se pondrá phone=NULL): ${lidUsers.length}`);

  if (!APPLY) {
    console.log("\nℹ️  DRY RUN: no se modificó nada. Ejecuta con --apply para aplicar.");
    return;
  }

  const delResult = await prisma.contact.updateMany({
    where: { id: { in: lidContacts.map((c) => c.id) } },
    data: { deletedAt: new Date() },
  });
  console.log(`\n✅ ${delResult.count} contactos LID marcados como eliminados (soft-delete).`);

  if (lidUsers.length) {
    const uResult = await prisma.user.updateMany({
      where: { id: { in: lidUsers.map((u) => u.id) } },
      data: { phone: null },
    });
    console.log(`✅ ${uResult.count} shadow users con phone=NULL.`);
  }
}

main()
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
