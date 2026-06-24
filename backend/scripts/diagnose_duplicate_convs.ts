import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

/**
 * DIAGNÓSTICO (solo-lectura) de conversaciones duplicadas.
 *
 * Detecta dos patrones:
 *  A) Varias conversaciones con channelId distinto pero el MISMO contactId (mismo humano).
 *  B) channelId tipo LID (@lid) que coexiste con la versión número-real.
 *
 * USO: npx ts-node -r tsconfig-paths/register scripts/diagnose_duplicate_convs.ts
 */

function digits(v: string | null): string {
  return (v || "").replace(/\D/g, "");
}

async function main() {
  const convs = await prisma.conversation.findMany({
    select: {
      id: true,
      companyId: true,
      channelId: true,
      contactId: true,
      subject: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  console.log(`\n📊 Total conversaciones: ${convs.length}\n`);

  // A) Duplicados por contactId
  const byContact = new Map<string, typeof convs>();
  for (const c of convs) {
    if (!c.contactId) continue;
    const key = `${c.companyId}::${c.contactId}`;
    if (!byContact.has(key)) byContact.set(key, []);
    byContact.get(key)!.push(c);
  }
  const dupByContact = [...byContact.entries()].filter(([, v]) => v.length > 1);
  console.log(`🔴 Contactos con MÁS de una conversación: ${dupByContact.length}`);
  for (const [key, list] of dupByContact.slice(0, 40)) {
    console.log(`\n  contact ${key}`);
    for (const c of list) {
      console.log(`    - conv ${c.id} | channelId=${c.channelId} | ${c.status} | "${c.subject}" | upd ${c.updatedAt.toISOString()}`);
    }
  }

  // B) LID coexistiendo con número real (mismo dígitos base o channelId @lid suelto)
  const lidConvs = convs.filter((c) => (c.channelId || "").includes("@lid"));
  console.log(`\n🟠 Conversaciones con channelId tipo LID (@lid): ${lidConvs.length}`);
  for (const c of lidConvs.slice(0, 40)) {
    console.log(`    - conv ${c.id} | channelId=${c.channelId} | contactId=${c.contactId ?? "—"} | "${c.subject}" | ${c.status}`);
  }

  // C) channelId con mismos dígitos pero formato distinto (raw vs @s.whatsapp.net)
  const byDigits = new Map<string, typeof convs>();
  for (const c of convs) {
    const d = digits(c.channelId);
    if (!d) continue;
    const key = `${c.companyId}::${d}`;
    if (!byDigits.has(key)) byDigits.set(key, []);
    byDigits.get(key)!.push(c);
  }
  const dupByDigits = [...byDigits.entries()].filter(([, v]) => v.length > 1);
  console.log(`\n🟡 Mismos dígitos en >1 conversación (formato distinto): ${dupByDigits.length}`);
  for (const [key, list] of dupByDigits.slice(0, 40)) {
    console.log(`\n  digits ${key}`);
    for (const c of list) {
      console.log(`    - conv ${c.id} | channelId=${c.channelId} | ${c.status}`);
    }
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
