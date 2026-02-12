import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Running Orphan Ticket Cleanup...");

  const activeTickets = await prisma.ticket.findMany({
    where: {
      status: { notIn: ["RESOLVED", "CLOSED"] },
      conversation: { isNot: null },
    },
    include: {
      conversation: {
        select: { id: true, status: true },
      },
      assignedTo: {
        select: { id: true, name: true, email: true },
      },
      queue: true,
    },
  });

  console.log(`📊 Total Active Tickets found: ${activeTickets.length}`);

  let orphanCount = 0;
  let syncCount = 0;

  for (const ticket of activeTickets) {
    const isOrphan = !ticket.assignedToId && !ticket.queueId;
    const isChatClosed =
      ticket.conversation?.status === "RESOLVED" ||
      ticket.conversation?.status === "CLOSED";

    // 1. Sync Logic (If chat is closed, close ticket)
    if (isChatClosed) {
      console.log(
        `  ❌ MISMATCH: Ticket #${ticket.ticketNumber} is ${ticket.status}, but Chat is CLOSED.`,
      );
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          status: ticket.conversation!.status as any,
          resolvedAt: new Date(),
          resolutionNotes: "System Sync: Chat was closed",
        },
      });
      syncCount++;
      console.log(`  ✅ Synced.`);
      continue;
    }

    // 2. Orphan Logic (If no agent & no queue, close it)
    if (isOrphan) {
      console.log(
        `  ⚠️ ORPHAN: Ticket #${ticket.ticketNumber} has no Agent and no Queue.`,
      );
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          status: "CLOSED",
          resolvedAt: new Date(),
          resolutionNotes: "System Cleanup: Orphan Ticket (No Agent/Queue)",
        },
      });
      orphanCount++;
      console.log(`  🧹 Cleaned (Closed).`);
    } else {
      console.log(
        `  ✅ Healthy Ticket: #${ticket.ticketNumber} assigned to ${ticket.assignedTo?.name || "Queue: " + ticket.queue?.name}`,
      );
    }
  }

  console.log("\n--- SUMMARY ---");
  console.log(`Total Scanned: ${activeTickets.length}`);
  console.log(`Synced Closed Chats: ${syncCount}`);
  console.log(`Cleaned Orphans: ${orphanCount}`);
  console.log(
    `Remaining Active: ${activeTickets.length - syncCount - orphanCount}`,
  );
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
