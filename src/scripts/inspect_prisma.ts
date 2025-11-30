import { prisma } from "../config/prisma";

async function main() {
  console.log("Inspecting Prisma Client keys...");
  try {
    // Force connection
    await prisma.$connect();
    console.log("Connected.");

    // Print keys of the prisma instance
    // Note: models are usually properties on the instance
    const keys = Object.keys(prisma);
    console.log("Prisma keys:", keys);

    // Check specifically for whatsAppSession
    if ((prisma as any).whatsAppSession) {
      console.log("prisma.whatsAppSession EXISTS");
    } else {
      console.log("prisma.whatsAppSession DOES NOT EXIST");
      // Try to find close matches
      const allProps = Object.getOwnPropertyNames(prisma);
      console.log(
        "All props:",
        allProps.filter((p) => p.toLowerCase().includes("what"))
      );
    }
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
