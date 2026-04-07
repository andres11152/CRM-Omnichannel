import { parentPort, workerData } from "worker_threads";
import makeWASocket, { 
  DisconnectReason, 
  fetchLatestBaileysVersion, 
  WASocket,
  Browsers,
  WAMessage,
  MessageUpsertType,
  AnyMessageContent
} from "@whiskeysockets/baileys";
import { Logger } from "@/utils/logger";
import { DatabaseAuthProvider } from "../whatsapp/providers/AuthProvider";

interface WorkerData {
  sessionId: string;
  companyId: string;
}

const { sessionId } = workerData as WorkerData;

// [TEST] Worker-Isolated Auth Provider
const authProvider = new DatabaseAuthProvider();

async function startWorker() {
  const { state, saveCreds } = await authProvider.loadState(sessionId);
  const { version } = await fetchLatestBaileysVersion();

  const sock: WASocket = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: Browsers.ubuntu("Reply CRM Worker"),
  });

  // Proxy Events to Parent Thread
  sock.ev.on("creds.update", async () => {
    await saveCreds();
    parentPort?.postMessage({ type: "CREDS_UPDATE" });
  });

  sock.ev.on("connection.update", (update) => {
    parentPort?.postMessage({ type: "CONNECTION_UPDATE", data: update });
    
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const error = lastDisconnect?.error as { output?: { statusCode?: number } } | undefined;
      const reason = error?.output?.statusCode;
      
      if (reason !== DisconnectReason.loggedOut) {
        startWorker(); // Auto-restart in Worker!
      } else {
        process.exit(0);
      }
    }
  });

  sock.ev.on("messages.upsert", (upsert: { messages: WAMessage[], type: MessageUpsertType }) => {
    parentPort?.postMessage({ type: "MESSAGES_UPSERT", data: upsert });
  });

  // Listen for Commands from Parent
  parentPort?.on("message", async (msg: { type: string, jid?: string, content?: AnyMessageContent }) => {
    if (msg.type === "SEND_MESSAGE" && msg.jid && msg.content) {
      await sock.sendMessage(msg.jid, msg.content); 
    }
    if (msg.type === "TERMINATE") {
      sock.end(undefined);
      process.exit(0);
    }
  });
}

Logger.info(`[Worker] [AI] Started for session: ${sessionId}`);
startWorker().catch(err => {
  const errorMessage = err instanceof Error ? err.message : String(err);
  Logger.error(`[Worker] [ERROR] Critical failure for ${sessionId}: ${errorMessage}`);
  process.exit(1);
});
