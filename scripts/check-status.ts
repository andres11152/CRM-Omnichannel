import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkStatus() {
  console.log("\n🔍 SYSTEM DIAGNOSTIC REPORT 🔍\n");

  // 1. Check Sessions
  const sessions = await prisma.whatsAppSession.findMany();

  if (sessions.length === 0) {
    console.log("❌ NO WHATSAPP SESSIONS FOUND. PLEASE SCAN QR CODE.");
  } else {
    console.log("✅ Found Sessions:");
    sessions.forEach((s) => {
      console.log(
        `- ID: ${s.sessionId} | Company: ${s.companyId} | Status: ${s.status}`,
      );
    });
  }

  // 2. Check Recent Messages (Last 5 mins)
  const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recentMessages = await prisma.message.count({
    where: { createdAt: { gte: fiveMinsAgo } },
  });
  console.log(`\n📨 Messages recieved in last 5 mins: ${recentMessages}`);

  // 3. Check Recent Tickets (Last 5 mins)
  const recentTickets = await prisma.ticket.count({
    where: { createdAt: { gte: fiveMinsAgo } },
  });
  console.log(`🎫 Tickets created in last 5 mins: ${recentTickets}`);

  // 4. Check Pending Conversations
  const openConvs = await prisma.conversation.count({
    where: { status: "OPEN" },
  });
  console.log(`💬 Open Conversations: ${openConvs}`);

  await prisma.$disconnect();
}

checkStatus().catch(console.error);
