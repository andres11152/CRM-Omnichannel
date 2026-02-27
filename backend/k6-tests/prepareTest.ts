import { execSync } from "child_process";
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
  stages: [
    { duration: '30s', target: ${Math.floor(targetUsers / 4)} },  // Ramp up
    { duration: '1m', target: ${targetUsers} },                   // Peak traffic
    { duration: '30s', target: 0 },                               // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500'], // 95% of requests must complete below 1.5s
    http_req_failed: ['rate<0.05'],    // Max 5% failure rate
  },
};

export default function () {
  const payload = JSON.stringify({
    from: "57300" + Math.floor(1000000 + Math.random() * 9000000), // simulate multiple users
    type: "text",
    content: "Prueba de carga concurrente " + __VU + "-" + __ITER,
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
  console.log("🚀 Starting Load Test Preparation...");
  // Replace these with actual test target endpoint and tokens once we know them,
  // or use the incoming webhook endpoint.
  const targetHost = process.env.TARGET_HOST || "http://localhost:3000";
  const webhookUrl = `${targetHost}/api/webhook/test`;
  const apiToken = process.env.API_TOKEN || "test_token";

  const scriptContent = generateK6Script(webhookUrl, apiToken);
  fs.writeFileSync(path.join(__dirname, "load-test.js"), scriptContent);

  console.log("📦 Generated K6 script at load-test.js");
  console.log("💡 To run: k6 run load-test.js");
}

run();
