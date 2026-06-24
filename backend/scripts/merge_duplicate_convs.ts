import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

/**
 * MERGE de conversaciones duplicadas por número (mismo dígitos, distinto formato de channelId).
 *
 * Causa: un code path guardaba channelId="573...@s.whatsapp.net" y otro "573..." (dígitos),
 * y el @@unique([companyId, channelId]) los trataba como distintos → 2 conversaciones del
 * mismo humano → chats duplicados en el inbox.
 *
 * Estrategia por cada grupo (companyId + dígitos):
 *   1. Canonical channelId = dígitos pelados.
 *   2. Winner = conv más reciente (updatedAt). Repuntamos al winner: mensajes, tickets,
 *      flow sessions de los losers; acumulamos unreadCount; conservamos contactId/subject
 *      si al winner le falta.
 *   3. Borramos los losers y dejamos winner.channelId = dígitos.
 *
 * USO:
 *   npx ts-node -r tsconfig-paths/register scripts/merge_duplicate_convs.ts          -> DRY RUN
 *   npx ts-node -r tsconfig-paths/register scripts/merge_duplicate_convs.ts --apply  -> aplica
 */

const APPLY = process.argv.includes("--apply");

function digits(v: string | null): string {
  return (v || "").replace(/\D/g, "");
}

async function main() {
  console.log(`🔀 Merge de conversaciones duplicadas — modo: ${APPLY ? "APLICAR" : "DRY RUN"}\n`);

  const convs = await prisma.conversation.findMany({
    select: {
      id: true,
      companyId: true,
      channelId: true,
      contactId: true,
      subject: true,
      status: true,
      unreadCount: true,
      updatedAt: true,
      isGroup: true,
    },
  });

  // Agrupar SOLO DMs (no grupos) por companyId + dígitos
  const groups = new Map<string, typeof convs>();
  for (const c of convs) {
    if (c.isGroup) continue;
    if ((c.channelId || "").includes("@g.us")) continue;
    const d = digits(c.channelId);
    if (!d) continue;
    const key = `${c.companyId}::${d}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  const dupGroups = [...groups.entries()].filter(([, v]) => v.length > 1);
  console.log(`🔴 Grupos duplicados a fusionar: ${dupGroups.length}\n`);

  let mergedConvs = 0;
  let movedMessages = 0;
  let movedTickets = 0;

  for (const [key, list] of dupGroups) {
    const canonical = key.split("::")[1];
    // Winner = más reciente
    const sorted = [...list].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const winner = sorted[0];
    const losers = sorted.slice(1);

    console.log(`\n  ${key}  (canonical channelId="${canonical}")`);
    console.log(`    winner  ${winner.id} | channelId=${winner.channelId} | ${winner.status}`);
    for (const l of losers) {
      console.log(`    loser   ${l.id} | channelId=${l.channelId} | ${l.status}`);
    }

    if (!APPLY) continue;

    await prisma.$transaction(async (tx) => {
      let unread = winner.unreadCount;
      let contactId = winner.contactId;
      let subject = winner.subject;

      for (const loser of losers) {
        const msgRes = await tx.message.updateMany({
          where: { conversationId: loser.id },
          data: { conversationId: winner.id },
        });
        movedMessages += msgRes.count;

        const tkRes = await tx.ticket.updateMany({
          where: { conversationId: loser.id },
          data: { conversationId: winner.id },
        });
        movedTickets += tkRes.count;

        await tx.contactFlowSession.updateMany({
          where: { conversationId: loser.id },
          data: { conversationId: winner.id },
        });

        unread += loser.unreadCount;
        if (!contactId && loser.contactId) contactId = loser.contactId;
        if ((!subject || /^~?\d+$/.test(subject)) && loser.subject && !/^~?\d+$/.test(loser.subject)) {
          subject = loser.subject;
        }

        await tx.conversation.delete({ where: { id: loser.id } });
        mergedConvs++;
      }

      // Canonicalizar el winner (ya sin conflicto, los losers fueron borrados)
      await tx.conversation.update({
        where: { id: winner.id },
        data: { channelId: canonical, unreadCount: unread, contactId, subject },
      });
    });

    console.log(`    ✅ fusionado`);
  }

  console.log(`\n──────────────────────────────────────`);
  console.log(`Conversaciones eliminadas (losers): ${mergedConvs}`);
  console.log(`Mensajes repuntados:                ${movedMessages}`);
  console.log(`Tickets repuntados:                 ${movedTickets}`);
  if (!APPLY) console.log(`\nℹ️  DRY RUN: no se modificó nada. Ejecuta con --apply para aplicar.`);
}

main()
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
