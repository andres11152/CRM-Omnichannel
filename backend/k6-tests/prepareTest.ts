import { execSync } from "child_process";
import { Logger } from "../src/utils/logger";
import * as fs from "fs";
import * as path from "path";

const targetUsers = 1000;
const messagesPerUser = 5;

// Define K6 script generator
function generateK6Script(targetUrl: string, apiToken: string) {
  return `
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  discardResponseBodies: true,
  stages: [
    { duration: '30s', target: ${Math.floor(targetUsers / 4)} },  // Ramp up
    { duration: '1m', target: ${targetUsers} },                   // Peak traffic
    { duration: '30s', target: 0 },                               // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2500'], // 95% of requests must complete below 2.5s (realistic for local)
    http_req_failed: ['rate<0.15'],    // Allow up to 15% failure due to local socket limits
  },
};

export default function () {
    const payload = JSON.stringify({
    from: "57300" + Math.floor(1000000 + Math.random() * 9000000) + "@s.whatsapp.net",
    text: "Prueba de carga concurrente " + __VU + "-" + __ITER,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ${apiToken}'
    },
  };

  const res = http.post('${targetUrl}', payload, params);
  
  check(res, {
    'status is 200 or 201': (r) => r.status === 200 || r.status === 201,
  });

  sleep(Math.random() * 1.5 + 0.5); // Add jitter to spacing
}
`;
}

async function run() {
  Logger.info("🚀 Starting Load Test Preparation...");

  const targetHost = process.env.TARGET_HOST || "http://localhost:4000";
  // Pointing to the demo company created in the seed (88888888-8888-8888-8888-888888888888)
  const webhookUrl = `${targetHost}/api/webhooks/whatsapp/88888888-8888-8888-8888-888888888888`;
  const apiToken = process.env.API_TOKEN || "test_token";

  const scriptContent = generateK6Script(webhookUrl, apiToken);
  fs.writeFileSync(path.join(__dirname, "load-test.js"), scriptContent);

  Logger.info(
    `📦 Generated K6 script at ${path.join(__dirname, "load-test.js")}`,
  );
  Logger.info("💡 To run: k6 run k6-tests/load-test.js");
}

run();
