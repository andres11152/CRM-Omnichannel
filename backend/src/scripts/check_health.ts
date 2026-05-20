import http from "http";

function checkHealth() {
  http.get("http://localhost:4000/health", (res) => {
    console.log("Status Code:", res.statusCode);
    let data = "";
    res.on("data", (chunk) => data += chunk);
    res.on("end", () => {
      console.log("Response:", data);
    });
  }).on("error", (err) => {
    console.error("Health check failed:", err.message);
  });
}

checkHealth();
