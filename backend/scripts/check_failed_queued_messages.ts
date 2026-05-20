import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

async function main() {
  const messages = await prisma.message.findMany({
    where: {
      status: { in: ["QUEUED", "FAILED"] },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`\n=== Queued or Failed Messages (${messages.length}) ===`);
  for (const m of messages) {
    console.log(`ID: ${m.id}`);
    console.log(`  CompanyId: ${m.companyId}`);
    console.log(`  Status: ${m.status}`);
    console.log(`  Direction: ${m.direction}`);
    console.log(`  Content: ${m.content}`);
    console.log(`  WhatsAppMsgId: ${m.whatsappMessageId}`);
    console.log(`  Metadata: ${JSON.stringify(m.metadata)}`);
    console.log(`  Created At: ${m.createdAt}\n`);
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
});
