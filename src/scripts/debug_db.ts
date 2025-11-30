import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Connecting to database...");
    await prisma.$connect();
    console.log("Connected successfully.");

    // Query to list all tables in the public schema
    const tables: any[] = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;

    console.log(`Found ${tables.length} tables:`);
    tables.forEach((t: any) => console.log(` - ${t.table_name}`));
  } catch (e) {
    console.error("Error querying database:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
