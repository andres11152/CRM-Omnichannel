import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log(`\n=== Users (${users.length}) ===`);
  for (const u of users) {
    console.log(`Email: ${u.email}`);
    console.log(`  Role: ${u.role}`);
    console.log(`  CompanyId: ${u.companyId}\n`);
  }
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
});
