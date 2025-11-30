import { PrismaClient } from "@prisma/client";
console.log("Import successful");
try {
  const prisma = new PrismaClient();
  console.log("Instantiation successful");
} catch (e) {
  console.error("Instantiation failed:", e);
}
