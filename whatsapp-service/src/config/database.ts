import { PrismaClient } from "@prisma/client";
import { Logger } from "../utils/logger";

export const prisma = new PrismaClient();

export const connectDB = async (): Promise<void> => {
  try {
    await prisma.$connect();
    Logger.info("[Database] Connected successfully to PostgreSQL");
  } catch (err) {
    Logger.error(err, "[Database] Failed to connect to PostgreSQL:");
    process.exit(1);
  }
};
