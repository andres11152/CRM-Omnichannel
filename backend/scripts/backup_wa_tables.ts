import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

/**
 * Respaldo (solo-lectura) de las tablas que borra total_clean.ts, a un JSON.
 * Red de seguridad antes de un wipe destructivo.
 */
async function main() {
  const url = process.env.DATABASE_URL || "";
  const host = url.includes("render.com") ? "RENDER" : "LOCAL";
  console.log(`📦 Backup desde: ${host} (${url.replace(/:\/\/[^@]*@/, "://***@").split("?")[0]})`);

  const data = {
    _meta: { takenAt: new Date().toISOString(), host, dbUrlMasked: url.replace(/:\/\/[^@]*@/, "://***@").split("?")[0] },
    conversation: await prisma.conversation.findMany(),
    ticket: await prisma.ticket.findMany(),
    message: await prisma.message.findMany(),
    messageReaction: await prisma.messageReaction.findMany(),
    whatsAppSession: await prisma.whatsAppSession.findMany(),
    whatsAppCredential: await prisma.whatsAppCredential.findMany(),
  };

  const counts = Object.fromEntries(
    Object.entries(data).filter(([k]) => k !== "_meta").map(([k, v]) => [k, (v as unknown[]).length]),
  );
  console.log("📊 Filas respaldadas:", counts);

  const dir = path.resolve(__dirname, "..", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `wa_backup_${host}_${ts}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  const sizeMB = (fs.statSync(file).size / 1024 / 1024).toFixed(2);
  console.log(`✅ Backup escrito: ${file} (${sizeMB} MB)`);
}

main()
  .catch((e) => { console.error("❌ Error:", e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
