import { connectDB } from "../src/config/database";
import { whatsappService } from "../src/whatsapp";

async function run() {
  await connectDB();
  const session = Array.from(whatsappService.getSessionManager().sessions.values())[0];
  if (!session) {
    console.log("No active WhatsApp session found.");
    process.exit(1);
  }

  console.log("Session found, retrieving group metadata...");
  try {
    const res = await session.onWhatsApp("177825252380918@lid");
    console.log("onWhatsApp LID response:", res);

    const res2 = await session.onWhatsApp("41653331095646@lid");
    console.log("onWhatsApp LID response 2:", res2);

    console.log("Attempting to dump lid mapping from store...");
    const store = whatsappService.getSessionManager().sessionStores.get(session.user.id);
    if (store) {
      console.log("Store found. Getting Lid mapping...");
      console.log("Lid mapping for 177825252380918:", store.lidToPhone["177825252380918"]);
    }
  } catch (error) {
    console.error("Error:", error);
  }
  process.exit();
}
run();
