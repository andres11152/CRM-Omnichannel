import { PrismaClient } from "@prisma/client";
import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();
const sessionId = "session_cmizfgg180000l4ntbq7uin8v_1765604831427";

const logoutSession = async () => {
  console.log(`[Tool] Forcing logout for session: ${sessionId}`);

  // 1. Clear Redis Auth Data
  if (process.env.REDIS_URL) {
    const redis = createClient({ url: process.env.REDIS_URL });
    await redis.connect();
    const key = `wa:auth:${sessionId}`;
    const exists = await redis.exists(key);
    if (exists) {
      await redis.del(key);
      console.log(`[Redis] ✅ Auth data deleted for ${sessionId}`);
    } else {
      console.log(`[Redis] ⚠️ No auth data found for ${sessionId}`);
    }
    await redis.disconnect();
  } else {
    console.warn("[Redis] ❌ REDIS_URL not set");
  }

  // 2. Update Database Status
  try {
    const output = await prisma.whatsAppSession.updateMany({
      where: { sessionId: sessionId },
      data: { status: "DISCONNECTED", qrCode: null },
    });
    console.log(`[DB] ✅ Updated ${output.count} session(s) to DISCONNECTED`);
  } catch (e) {
    console.error(`[DB] ❌ Error updating session: ${e}`);
  }
};

logoutSession()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
