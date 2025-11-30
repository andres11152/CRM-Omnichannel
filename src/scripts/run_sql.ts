import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Connecting to database...");
    await prisma.$connect();
    console.log("Connected successfully.");

    const sqlPath = path.join(__dirname, "../../create_campaigns_table.sql");
    console.log(`Reading SQL from ${sqlPath}`);
    const sql = fs.readFileSync(sqlPath, "utf-8");

    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(`Found ${statements.length} statements.`);

    for (const statement of statements) {
      console.log(`Executing statement: ${statement.substring(0, 50)}...`);
      try {
        await prisma.$executeRawUnsafe(statement);
      } catch (err: any) {
        // Ignore "type already exists" errors for enums or "relation already exists"
        if (err.message.includes("already exists")) {
          console.log("Skipping existing object.");
        } else {
          throw err;
        }
      }
    }

    console.log("Migration applied successfully.");
  } catch (e) {
    console.error("Error executing SQL:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
