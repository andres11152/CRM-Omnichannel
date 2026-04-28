import redisClient from "../src/config/redis";

async function run() {
  console.log("Connecting to Redis...");
  try {
    await redisClient.connect().catch(() => {}); // Ensure connected
    await redisClient.flushDb();
    console.log("Redis FLUSHDB successful.");
  } catch (error) {
    console.error("Failed to flush Redis:", error);
  }
  process.exit(0);
}
run();
