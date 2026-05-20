import axios from "axios";

async function run() {
  try {
    const res = await axios.get("http://localhost:4000/api/whatsapp-debug-memory");
    console.log("IN_MEMORY_SESSIONS:", JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error("Error fetching debug status:", err.message, err.response?.data);
  }
}

run();
