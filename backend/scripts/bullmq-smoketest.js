/**
 * BullMQ Smoke Test — Isolated diagnostic.
 *
 * Proves whether a BullMQ Worker can CONSUME jobs against the configured Redis,
 * using the SAME connection options as InboundWorker.ts. No app code involved.
 *
 * Run:  node scripts/bullmq-smoketest.js
 *
 * Interpretation:
 *  - "CONSUMED" → BullMQ works against this Redis. The inbound bug is upstream
 *    (the MESSAGE_RECEIVED subscriber never fired / no jobs were enqueued).
 *  - "TIMEOUT (worker never picked up the job)" → BullMQ cannot consume on this
 *    Redis (managed ACL / command restriction / version). Consolidate inbound
 *    onto the Bull-legacy system that already works for outbound.
 */
require("dotenv").config();
const IORedis = require("ioredis");
const { Queue, Worker } = require("bullmq");

const REDIS_URL = process.env.REDIS_URL;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const isTls = REDIS_URL && REDIS_URL.startsWith("rediss://");

if (!REDIS_URL) {
  console.error("[smoketest] REDIS_URL not set. Aborting.");
  process.exit(2);
}

const connOpts = {
  maxRetriesPerRequest: null,
  password: REDIS_PASSWORD,
  tls: isTls ? { rejectUnauthorized: false } : undefined,
};

const QUEUE = "smoketest-" + Date.now();
let consumed = false;

async function main() {
  console.log(`[smoketest] Redis: ${REDIS_URL.replace(/:[^:@/]*@/, ":***@")}`);
  console.log(`[smoketest] Queue: ${QUEUE}`);

  // Producer connection
  const producerConn = new IORedis(REDIS_URL, connOpts);
  producerConn.on("error", (e) => console.error("[smoketest] producer redis error:", e.message));

  // Worker connection (mirrors InboundWorker.ts)
  const workerConn = new IORedis(REDIS_URL, connOpts);
  workerConn.on("error", (e) => console.error("[smoketest] worker redis error:", e.message));

  const queue = new Queue(QUEUE, { connection: producerConn });

  const worker = new Worker(
    QUEUE,
    async (job) => {
      console.log(`[smoketest] ✅ WORKER PICKED UP job ${job.id} data=`, job.data);
      consumed = true;
      return { ok: true };
    },
    { connection: workerConn, concurrency: 3 }
  );

  worker.on("ready", () => console.log("[smoketest] worker READY (listening)"));
  worker.on("error", (e) => console.error("[smoketest] worker ERROR:", e.message));
  worker.on("failed", (job, err) => console.error(`[smoketest] job ${job?.id} FAILED:`, err.message));
  worker.on("completed", (job) => console.log(`[smoketest] job ${job.id} COMPLETED`));

  // Give the worker a moment to connect, then enqueue
  await new Promise((r) => setTimeout(r, 1500));
  const job = await queue.add("ping", { hello: "world", t: Date.now() }, { delay: 0 });
  console.log(`[smoketest] enqueued job ${job.id}`);

  // Wait up to 10s for consumption
  const deadline = Date.now() + 10000;
  while (!consumed && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
  }

  if (consumed) {
    console.log("\n[smoketest] RESULT: CONSUMED ✅ — BullMQ works on this Redis. Inbound bug is UPSTREAM (subscriber/enqueue), not the worker.");
  } else {
    console.log("\n[smoketest] RESULT: TIMEOUT ❌ — worker never picked up the job. BullMQ cannot consume on this Redis.");
    // Extra diagnostics: counts + server info
    try {
      const counts = await queue.getJobCounts("wait", "active", "delayed", "completed", "failed");
      console.log("[smoketest] job counts:", counts);
    } catch (e) {
      console.error("[smoketest] getJobCounts error:", e.message);
    }
    try {
      const info = await producerConn.info("server");
      const ver = (info.match(/redis_version:(.*)/) || [])[1];
      const mode = (info.match(/redis_mode:(.*)/) || [])[1];
      console.log(`[smoketest] redis_version:${(ver || "?").trim()} redis_mode:${(mode || "?").trim()}`);
    } catch (e) {
      console.error("[smoketest] INFO command error (may be ACL-restricted):", e.message);
    }
  }

  await worker.close();
  await queue.obliterate({ force: true }).catch(() => {});
  await queue.close();
  producerConn.disconnect();
  workerConn.disconnect();
  process.exit(consumed ? 0 : 1);
}

main().catch((e) => {
  console.error("[smoketest] FATAL:", e);
  process.exit(3);
});
