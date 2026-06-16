import { createClient } from "redis";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function run() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error("❌ No REDIS_URL found in environment.");
    process.exit(1);
  }

  console.log("🔌 Connecting to production Redis at:", redisUrl);
  const client = createClient({ url: redisUrl });
  
  try {
    await client.connect();
    console.log("✅ Redis connected successfully!");
    
    const testKey = "reply:smoke_test:temp";
    const testValue = `ok-${Date.now()}`;
    
    await client.set(testKey, testValue, { EX: 10 });
    console.log(`📝 Wrote key '${testKey}' with value '${testValue}'`);
    
    const readValue = await client.get(testKey);
    console.log(`📖 Read key '${testKey}' value: '${readValue}'`);
    
    if (readValue === testValue) {
      console.log("🚀 REDIS SMOKE TEST PASSED!");
    } else {
      console.error("❌ REDIS SMOKE TEST FAILED: Values did not match.");
    }
  } catch (error) {
    console.error("❌ Redis operation failed:", error);
  } finally {
    await client.quit();
  }
  process.exit(0);
}
run();
