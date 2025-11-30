const { PrismaClient } = require("@prisma/client");
const PrismaModule = require("@prisma/client");

console.log("PrismaModule keys:", Object.keys(PrismaModule));

const prisma = new PrismaClient();
console.log("Prisma instance keys:", Object.keys(prisma));
