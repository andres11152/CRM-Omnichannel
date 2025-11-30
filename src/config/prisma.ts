import { PrismaClient } from "@prisma/client";

console.log("[Config] Initializing Prisma Client...");

const prisma = new PrismaClient({
  log: ["query", "info", "warn", "error"],
});

export { prisma };
