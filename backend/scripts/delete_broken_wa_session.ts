import dotenv from "dotenv"; dotenv.config();
import { prisma } from "@/config/database";
import redisClient from "@/config/redis";

/**
 * Deletes a broken/looping WhatsApp session (DB rows + Redis cache) so it is NOT
 * auto-restored on next backend boot. Use when a half-paired session causes an endless
 * reconnect loop that saturates the event loop. After running, restart the backend and
 * re-scan the QR for a fresh session.
 *
 * USE: npx ts-node -r tsconfig-paths/register scripts/delete_broken_wa_session.ts [sessionId]
 */
async function main() {
  const sessionId = process.argv[2] || "wa_88888888-8888-8888-8888-888888888888_mqraannm";
  console.log(`🗑️  Deleting WhatsApp session: ${sessionId}`);

  const creds = await prisma.whatsAppCredential.deleteMany({ where: { sessionId } });
  console.log(`  credentials deleted: ${creds.count}`);

  const sess = await prisma.whatsAppSession.deleteMany({ where: { sessionId } });
  console.log(`  session rows deleted: ${sess.count}`);

  // Clear Redis cache (creds + store) for this session
  try {
    if (!redisClient.isOpen) await redisClient.connect().catch(() => {});
    const patterns = [`wa:sess:${sessionId}:*`, `wa:store:*${sessionId}*`];
    let total = 0;
    for (const p of patterns) {
      const keys = await redisClient.keys(p);
      if (keys.length) { await redisClient.del(keys); total += keys.length; }
    }
    console.log(`  redis keys cleared: ${total}`);
  } catch (e) {
    console.warn("  redis clear skipped:", (e as Error).message);
  }

  console.log("✨ Done. Restart backend and re-scan the QR.");
}

main()
  .catch((e) => { console.error("❌", e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); try { await redisClient.quit(); } catch { /* noop */ } });
