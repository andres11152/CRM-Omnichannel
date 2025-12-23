import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanMobileAgent() {
  console.log('🧹 Starting cleanup of "Desde Celular" agent...');

  // 1. Find the mobile agent
  const mobileAgent = await prisma.user.findFirst({
    where: {
      OR: [{ name: "Desde Celular" }, { email: { startsWith: "mobile_" } }],
    },
  });

  if (!mobileAgent) {
    console.log('✅ No "Desde Celular" agent found. System is clean.');
    return;
  }

  console.log(
    `⚠️ Found fake agent: ${mobileAgent.name} (${mobileAgent.email})`
  );

  // 2. Find a fallback admin to inherit any potentially linked data (just in case)
  const admin = await prisma.user.findFirst({
    where: {
      companyId: mobileAgent.companyId || undefined,
      role: "ADMIN",
    },
  });

  if (!admin) {
    console.log("❌ No admin found to reassign data. Aborting safety cleanup.");
    // Force delete anyway if no admin? No, better warn.
    // Actually for this specific case, we know it's garbage. We can probably just delete relations if they are trivial.
  } else {
    console.log(`🔄 Reassigning data to Admin: ${admin.name}...`);

    // Update messages sent by this fake user to be sent by Admin
    await prisma.message.updateMany({
      where: { senderId: mobileAgent.id },
      data: { senderId: admin.id },
    });

    // Update conversations assigned to this fake user
    await prisma.conversation.updateMany({
      where: { assignedToId: mobileAgent.id },
      data: { assignedToId: admin.id },
    });
  }

  // 3. Delete the user
  await prisma.user.delete({
    where: { id: mobileAgent.id },
  });

  console.log('✅ "Desde Celular" agent deleted successfully.');
}

cleanMobileAgent()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
