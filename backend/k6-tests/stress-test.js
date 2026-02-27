/**
 * ====================================================
 *  🔥 Reply CRM — Backend Stress Test Suite
 * ====================================================
 *  Prueba de carga nativa con Node.js (sin dependencias externas).
 *  Simula tráfico concurrente contra los endpoints públicos del backend.
 *
 *  USO:
 *    node k6-tests/stress-test.js
 *
 *  ENV VARS (opcionales):
 *    TARGET_HOST   → default: http://localhost
 *    TARGET_PORT   → default: 4000
 *    MAX_REQUESTS  → default: 1000
 *    CONCURRENCY   → default: 200
 * ====================================================
 */

const http = require("http");

// ─── Config ──────────────────────────────────────────
const HOST = process.env.TARGET_HOST || "localhost";
const PORT = parseInt(process.env.TARGET_PORT || "4000", 10);
const MAX_REQUESTS = parseInt(process.env.MAX_REQUESTS || "1000", 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || "200", 10);

const agent = new http.Agent({ keepAlive: true, maxSockets: CONCURRENCY });

// ─── Scenarios ───────────────────────────────────────
const SCENARIOS = [
  {
    name: "Health Check (GET /health)",
    method: "GET",
    path: "/health",
    weight: 30, // 30% of traffic
  },
  {
    name: "Liveness Probe (GET /health/liveness)",
    method: "GET",
    path: "/health/liveness",
    weight: 20,
  },
  {
    name: "Readiness Probe (GET /health/readiness)",
    method: "GET",
    path: "/health/readiness",
    weight: 20,
  },
  {
    name: "Root API (GET /)",
    method: "GET",
    path: "/",
    weight: 15,
  },
  {
    name: "Auth Login Attempt (POST /api/auth/login)",
    method: "POST",
    path: "/api/auth/login",
    body: JSON.stringify({ email: "load@test.com", password: "LoadTest2026!" }),
    weight: 15,
  },
];

// ─── Metrics ─────────────────────────────────────────
const results = {
  total: 0,
  success: 0,
  errors: 0,
  byStatus: {},
  byScenario: {},
  latencies: [],
};

function pickScenario() {
  const rand = Math.random() * 100;
  let cumulative = 0;
  for (const s of SCENARIOS) {
    cumulative += s.weight;
    if (rand <= cumulative) return s;
  }
  return SCENARIOS[0];
}

// ─── Request Runner ──────────────────────────────────
function sendRequest(id) {
  return new Promise((resolve) => {
    const scenario = pickScenario();
    const startMs = Date.now();

    const options = {
      hostname: HOST,
      port: PORT,
      path: scenario.path,
      method: scenario.method,
      headers: { "Content-Type": "application/json" },
      agent,
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        const latency = Date.now() - startMs;
        results.total++;
        results.latencies.push(latency);

        // Track by status code
        const code = res.statusCode;
        results.byStatus[code] = (results.byStatus[code] || 0) + 1;

        // Track by scenario
        if (!results.byScenario[scenario.name]) {
          results.byScenario[scenario.name] = { ok: 0, fail: 0, latencies: [] };
        }
        results.byScenario[scenario.name].latencies.push(latency);

        if (code >= 200 && code < 500) {
          results.success++;
          results.byScenario[scenario.name].ok++;
        } else {
          results.errors++;
          results.byScenario[scenario.name].fail++;
        }
        resolve();
      });
    });

    req.on("error", (e) => {
      results.total++;
      results.errors++;
      if (!results.byScenario[scenario.name]) {
        results.byScenario[scenario.name] = { ok: 0, fail: 0, latencies: [] };
      }
      results.byScenario[scenario.name].fail++;
      resolve();
    });

    req.setTimeout(10000, () => {
      req.destroy();
      results.total++;
      results.errors++;
      resolve();
    });

    if (scenario.body) req.write(scenario.body);
    req.end();
  });
}

// ─── Percentile Calculator ───────────────────────────
function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ─── Main Runner ─────────────────────────────────────
async function run() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   🔥 Reply CRM — Backend Stress Test            ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║ Target:      http://${HOST}:${PORT}`);
  console.log(`║ Requests:    ${MAX_REQUESTS}`);
  console.log(`║ Concurrency: ${CONCURRENCY}`);
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Pre-flight check
  console.log("⏳ Pre-flight: checking server connectivity...");
  try {
    await new Promise((resolve, reject) => {
      const req = http.get(`http://${HOST}:${PORT}/health`, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          console.log(`✅ Server is alive (status ${res.statusCode})\n`);
          resolve();
        });
      });
      req.on("error", reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error("Timeout"));
      });
    });
  } catch (e) {
    console.error(`❌ Server NOT reachable at http://${HOST}:${PORT}`);
    console.error(
      "   Asegúrate de que el backend esté corriendo con: npm run dev",
    );
    process.exit(1);
  }

  // Launch requests in controlled batches
  const startTime = Date.now();
  const batches = Math.ceil(MAX_REQUESTS / CONCURRENCY);

  for (let b = 0; b < batches; b++) {
    const batchSize = Math.min(CONCURRENCY, MAX_REQUESTS - b * CONCURRENCY);
    const promises = [];
    for (let i = 0; i < batchSize; i++) {
      promises.push(sendRequest(b * CONCURRENCY + i));
    }
    await Promise.all(promises);
    process.stdout.write(
      `\r   📊 Progress: ${results.total}/${MAX_REQUESTS} requests completed...`,
    );
  }

  const totalTime = Date.now() - startTime;

  // ─── Report ──────────────────────────────────────────
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║            🔥 STRESS TEST RESULTS 🔥            ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║ ⏱️  Total Time:      ${totalTime} ms`);
  console.log(`║ ✅ Successful:      ${results.success}`);
  console.log(`║ ❌ Errors:          ${results.errors}`);
  console.log(
    `║ 📈 Throughput:      ${((results.total / totalTime) * 1000).toFixed(2)} req/sec`,
  );
  console.log("╠══════════════════════════════════════════════════╣");
  console.log("║ 📐 LATENCY PERCENTILES                          ║");
  console.log(`║    p50:  ${percentile(results.latencies, 50)} ms`);
  console.log(`║    p90:  ${percentile(results.latencies, 90)} ms`);
  console.log(`║    p95:  ${percentile(results.latencies, 95)} ms`);
  console.log(`║    p99:  ${percentile(results.latencies, 99)} ms`);
  console.log(`║    max:  ${percentile(results.latencies, 100)} ms`);
  console.log("╠══════════════════════════════════════════════════╣");
  console.log("║ 📊 STATUS CODE DISTRIBUTION                     ║");
  for (const [code, count] of Object.entries(results.byStatus)) {
    console.log(`║    HTTP ${code}: ${count} responses`);
  }
  console.log("╠══════════════════════════════════════════════════╣");
  console.log("║ 🎯 PER-SCENARIO BREAKDOWN                       ║");
  for (const [name, data] of Object.entries(results.byScenario)) {
    const avgLat = data.latencies.length
      ? (
          data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length
        ).toFixed(1)
      : "N/A";
    console.log(`║  ${name}`);
    console.log(
      `║    ✅ ${data.ok} ok | ❌ ${data.fail} fail | ⏱️  avg ${avgLat}ms`,
    );
  }
  console.log("╚══════════════════════════════════════════════════╝");

  // Evaluation
  const p95 = percentile(results.latencies, 95);
  const errorRate = (results.errors / results.total) * 100;

  console.log("\n📋 EVALUACIÓN:");
  if (p95 < 500 && errorRate < 5) {
    console.log(
      "   ✅ APROBADO — El backend maneja la carga dentro de los umbrales aceptables.",
    );
  } else if (p95 < 1500 && errorRate < 10) {
    console.log(
      "   ⚠️  ACEPTABLE CON ADVERTENCIAS — Revisa los percentiles altos y conexiones a DB.",
    );
  } else {
    console.log(
      "   ❌ REPROBADO — Necesitas optimizar el connection pool o revisar cuellos de botella.",
    );
  }

  process.exit(0);
}

run();
