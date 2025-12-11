import { PrismaClient } from "@prisma/client";

console.log("[Config] Initializing Prisma Client...");

const prisma = new PrismaClient({
  log: ["warn", "error"], // Only show warnings and errors, no query logs
});

export { prisma };
