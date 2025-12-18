/* eslint-disable no-console */
require("dotenv").config();
const { createClient } = require("redis");

async function resetSession() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.error("❌ REDIS_URL not found in .env");
    process.exit(1);
  }

  const client = createClient({
    url: redisUrl,
    socket: {
      tls: redisUrl.startsWith("rediss://"),
      rejectUnauthorized: false,
    },
  });

  client.on("error", (err) => console.error("Redis Client Error", err));

  try {
    console.log("🔌 Connecting to Redis...");
    await client.connect();
    console.log("✅ Connected.");

    // Updated patterns to match actual code prefixes found in source:
    // wa:auth:* (Auth credentials)
    // wa:store:* (Message store)
    // *baileys* (Legacy/Other)
    const patterns = ["wa:auth:*", "wa:store:*", "*baileys*", "*whatsapp*"];
    let totalDeleted = 0;

    for (const pattern of patterns) {
      console.log(`🔎 Searching for keys matching: ${pattern}`);
      const keys = await client.keys(pattern);

      if (keys.length > 0) {
        console.log(
          `🗑  Found ${keys.length} keys for pattern ${pattern}. Deleting...`
        );
        const deleted = await client.del(keys);
        totalDeleted += deleted;
      } else {
        console.log(`🤷 No keys found for pattern ${pattern}`);
      }
    }

    console.log(`🎉 Done! Total keys deleted: ${totalDeleted}`);
  } catch (err) {
    console.error("❌ Error clearing sessions:", err);
  } finally {
    if (client.isOpen) {
      await client.disconnect();
    }
    console.log("👋 Redis connection closed.");
  }
}

resetSession();
