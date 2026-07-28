const Redis = require("ioredis");

const url = process.argv[2];
const redis = new Redis(url, {
  tls: {},
  maxRetriesPerRequest: 3,
});

function bucketOf(key) {
  const parts = key.split(":");
  if (parts.length >= 2) return parts[0] + ":" + parts[1];
  return parts[0];
}

async function main() {
  const info = await redis.info("memory");
  console.log("=== MEMORY INFO ===");
  const lines = info.split("\n").filter((l) =>
    /^(used_memory_human|used_memory_rss_human|maxmemory_human|maxmemory_policy|mem_fragmentation_ratio):/.test(l)
  );
  console.log(lines.join(""));

  const dbsize = await redis.dbsize();
  console.log("DBSIZE:", dbsize);

  const buckets = new Map(); // bucket -> { count, ttlCount, sampledBytes, sampledCount }
  let cursor = "0";
  let scanned = 0;
  const SAMPLE_EVERY = 25; // sample memory usage every Nth key per bucket encounter

  do {
    const [next, keys] = await redis.scan(cursor, "COUNT", "1000");
    cursor = next;
    for (const key of keys) {
      scanned++;
      const b = bucketOf(key);
      if (!buckets.has(b)) buckets.set(b, { count: 0, ttlCount: 0, sampledBytes: 0, sampledCount: 0 });
      const entry = buckets.get(b);
      entry.count++;
      if (entry.count % SAMPLE_EVERY === 0) {
        try {
          const [ttl, mem] = await Promise.all([
            redis.ttl(key),
            redis.call("MEMORY", "USAGE", key),
          ]);
          if (ttl > 0) entry.ttlCount++;
          if (mem) {
            entry.sampledBytes += Number(mem);
            entry.sampledCount++;
          }
        } catch (e) {
          // ignore sampling errors
        }
      }
    }
  } while (cursor !== "0");

  console.log("Total scanned:", scanned);
  console.log("\n=== BUCKETS (estimated) ===");
  const rows = [];
  for (const [b, e] of buckets.entries()) {
    const avgBytes = e.sampledCount > 0 ? e.sampledBytes / e.sampledCount : 0;
    const estTotalBytes = avgBytes * e.count;
    const ttlRatio = e.sampledCount > 0 ? (e.ttlCount / e.sampledCount) * 100 : 0;
    rows.push({
      bucket: b,
      count: e.count,
      avgBytes: Math.round(avgBytes),
      estTotalMB: (estTotalBytes / 1024 / 1024).toFixed(2),
      ttlPct: ttlRatio.toFixed(0) + "%",
    });
  }
  rows.sort((a, b) => parseFloat(b.estTotalMB) - parseFloat(a.estTotalMB));
  for (const r of rows) {
    console.log(
      `${r.bucket.padEnd(35)} count=${String(r.count).padEnd(8)} avg=${String(r.avgBytes).padEnd(8)}B est=${r.estTotalMB.padEnd(10)}MB ttl%=${r.ttlPct}`
    );
  }

  await redis.quit();
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
