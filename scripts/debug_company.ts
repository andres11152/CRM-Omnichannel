import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  try {
    const companies = await prisma.company.findMany({
      include: {
        plan: true,
        users: true,
        _count: {
          select: { users: true },
        },
      },
    });

    let output = "";
    output += `Found companies: ${companies.length}\n`;
    for (const c of companies) {
      output += `Company: ${c.name} (${c.id})\n`;
      output += `Plan: ${c.plan?.name || "None"} (ID: ${c.planId})\n`;
      output += `User Count (DB Agg): ${c._count.users}\n`;
      output += `Users List:\n`;
      c.users.forEach((u) => {
        output += ` - ID: ${u.id} | Name: ${u.name} | Email: ${u.email} | Role: ${u.role}\n`;
      });
      output += "-------------------\n";
    }

    fs.writeFileSync(path.join(process.cwd(), "debug_output.txt"), output);
    console.log("Debug output written to debug_output.txt");
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
