import { whatsappService } from "../services/whatsapp.service";
import { prisma } from "../config/prisma";

async function main() {
  console.log("Testing WhatsApp Service...");
  try {
    // 1. List sessions
    console.log("Listing sessions...");
    // Use a dummy companyId that likely exists or create one?
    // We'll just use a random one, it should return empty array, not crash.
    const sessions = await whatsappService.listSessions("test_company_id");
    console.log("Sessions:", sessions);

    // 2. Create session (mock)
    // console.log("Creating session...");
    // const session = await whatsappService.createSession("test_company_id");
    // console.log("Session created:", session);
  } catch (e) {
    console.error("TEST FAILED:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
