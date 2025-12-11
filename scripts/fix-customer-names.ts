/**
 * Fix all incorrectly named customer users
 * Changes "Skycode Agency" or "Desde Celular" to the phone number
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixCustomerNames() {
  try {
    console.log("🔧 Fixing incorrectly named customer users...\n");

    // Find all users with WhatsApp email pattern and incorrect names
    const usersToFix = await prisma.user.findMany({
      where: {
        email: { contains: "@whatsapp.user" },
        OR: [
          { name: "Skycode Agency" },
          { name: "Desde Celular" },
          { name: { startsWith: "mobile_" } },
        ],
      },
    });

    console.log(`Found ${usersToFix.length} users to fix:\n`);

    for (const user of usersToFix) {
      // Extract phone from email (format: 573154080831@whatsapp.user)
      const phone = user.email.split("@")[0];

      console.log(`Fixing: ${user.id}`);
      console.log(`  Old name: ${user.name}`);
      console.log(`  New name: ${phone}`);

      await prisma.user.update({
        where: { id: user.id },
        data: { name: phone },
      });
    }

    console.log(`\n✅ Fixed ${usersToFix.length} users`);

    // Also update conversation subjects
    console.log("\n🔧 Fixing conversation subjects...\n");

    const convsToFix = await prisma.conversation.findMany({
      where: {
        subject: {
          in: ["WhatsApp: Skycode Agency", "WhatsApp: Desde Celular"],
        },
      },
      include: {
        participants: {
          where: {
            email: { contains: "@whatsapp.user" },
          },
          take: 1,
        },
      },
    });

    console.log(`Found ${convsToFix.length} conversations to fix:\n`);

    for (const conv of convsToFix) {
      if (conv.participants.length > 0) {
        const newSubject = `WhatsApp: ${conv.participants[0].name}`;
        console.log(`Fixing conversation: ${conv.id}`);
        console.log(`  Old subject: ${conv.subject}`);
        console.log(`  New subject: ${newSubject}`);

        await prisma.conversation.update({
          where: { id: conv.id },
          data: { subject: newSubject },
        });
      }
    }

    console.log(`\n✅ Fixed ${convsToFix.length} conversations`);
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

fixCustomerNames();
