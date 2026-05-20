import axios from "axios";

async function run() {
  try {
    const res = await axios.get("http://localhost:4000/api/whatsapp-debug-memory", {
      headers: {
        "Accept": "application/json"
      }
    });
    console.log("Response:", res.status, res.data);
  } catch (err: any) {
    console.error("Axios Error Status:", err.response?.status);
    console.error("Axios Error Data:", err.response?.data);
    console.error("Axios Error Message:", err.message);
    if (err.code) {
      console.error("Axios Error Code:", err.code);
    }
  }
}

run();
