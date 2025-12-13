import { prisma } from "../src/config/prisma";

async function cleanupGeneric() {
  console.log(
    "🧹 Starting Cleanup for Generic Names ('Usuario de WhatsApp')..."
  );

  try {
    // 1. Find Contacts with bad names
    const contacts = await prisma.contact.findMany({
      where: {
        OR: [
          { name: { contains: "Usuario WhatsApp", mode: "insensitive" } },
          { name: { contains: "Usuario de WhatsApp", mode: "insensitive" } },
          { name: { contains: "Unknown", mode: "insensitive" } },
          { name: { contains: "Sin Nombre", mode: "insensitive" } },
        ],
      },
    });

    console.log(`Found ${contacts.length} contacts with generic names.`);

    for (const contact of contacts) {
      // Use phone as name
      if (contact.phone) {
        console.log(
          `Fixing Contact ${contact.id}: "${contact.name}" -> "${contact.phone}"`
        );
        await prisma.contact.update({
          where: { id: contact.id },
          data: { name: contact.phone },
        });

        // Also update User if exists
        await prisma.user.updateMany({
          where: {
            companyId: contact.companyId,
            email: `${contact.phone}@whatsapp.user`,
          },
          data: { name: contact.phone },
        });
      }
    }

    // Find Users manually that might not match contacts logic perfectly
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: "Usuario WhatsApp", mode: "insensitive" } },
          { name: { contains: "Usuario de WhatsApp", mode: "insensitive" } },
          { name: { contains: "Unknown", mode: "insensitive" } },
        ],
        role: "USER",
      },
    });

    console.log(`Found ${users.length} users with generic names.`);
    for (const user of users) {
      if (user.phone) {
        console.log(
          `Fixing User ${user.id}: "${user.name}" -> "${user.phone}"`
        );
        await prisma.user.update({
          where: { id: user.id },
          data: { name: user.phone },
        });
      }
    }
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
  } finally {
    await prisma.$disconnect();
    console.log("Done.");
  }
}

cleanupGeneric();
