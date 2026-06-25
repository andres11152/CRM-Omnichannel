import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587");
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  console.log(`\n📧 Probando SMTP: ${host}:${port} secure=${secure} user=${user} passLen=${pass?.length}`);

  const t = nodemailer.createTransport({
    host, port, secure,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
  });

  try {
    await t.verify();
    console.log("✅ LOGIN OK — las credenciales son válidas.");
  } catch (e) {
    console.log(`❌ LOGIN FALLÓ: ${e instanceof Error ? e.message : String(e)}`);
  }
}

main();
