import { createClient } from "redis";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function run() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log("No REDIS_URL found in environment. Skipping Redis flush.");
    process.exit(0);
  }

  console.log("Connecting to Redis at:", redisUrl);
  const client = createClient({ url: redisUrl });
  
  try {
    await client.connect();
    await client.flushDb();
    console.log("Redis FLUSHDB successful.");
  } catch (error) {
    console.error("Failed to flush Redis:", error);
  } finally {
    await client.quit();
  }
  process.exit(0);
}
run();
