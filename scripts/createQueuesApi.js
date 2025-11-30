// Native fetch in Node 18+

const BASE_URL = "http://localhost:4000/api"; // Adjust port if needed
const EMAIL = "admin@reply.com";
const PASSWORD = "password123";

async function main() {
  // 1. Login
  console.log("Logging in...");
  try {
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });

    if (!loginRes.ok) {
      console.error("Login failed:", await loginRes.text());
      return;
    }

    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log("Logged in. Token obtained.");

    // 2. Create Queues
    const queues = [
      { name: "Ventas", department: "Sales" },
      { name: "Soporte", department: "Support" },
      { name: "Facturación", department: "Billing" },
    ];

    for (const q of queues) {
      console.log(`Creating queue: ${q.name}...`);
      const res = await fetch(`${BASE_URL}/queues`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: q.name,
          department: q.department,
          description: `Cola para ${q.department}`,
        }),
      });

      if (res.ok) {
        console.log(`✅ Queue created: ${q.name}`);
      } else {
        console.error(`❌ Failed to create queue ${q.name}:`, await res.text());
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
