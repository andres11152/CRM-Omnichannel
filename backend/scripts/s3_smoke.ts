import * as dotenv from "dotenv";
dotenv.config();

import { initEnv } from "@/config/env";

/**
 * Smoke test del StorageService real (mismo code path que prod) contra el
 * endpoint configurado en .env (MinIO en local). Sube, firma, descarga y borra.
 */
async function main() {
  initEnv();
  const { storageService } = await import("@/services/StorageService");
  console.log(`🧪 STORAGE_PROVIDER=${process.env.STORAGE_PROVIDER} bucket=${process.env.S3_BUCKET_NAME} endpoint=${process.env.S3_ENDPOINT || "(AWS real)"}`);

  const content = Buffer.from(`hola minio ${new Date().toISOString()}`);
  const up = await storageService.uploadFile("smoke-company", content, "test.txt", "text/plain");
  console.log("⬆️  upload:", up);

  const signed = await storageService.getSignedUrl(up.key, 120);
  console.log("🔗 presigned:", signed);

  const res = await fetch(signed);
  const body = await res.text();
  console.log(`⬇️  download status=${res.status} body="${body}"`);

  // limpieza
  // @ts-ignore — deleteFile existe en la interfaz
  if (typeof (storageService as { deleteFile?: unknown }).deleteFile === "function") {
    // @ts-ignore
    await storageService.deleteFile(up.key);
    console.log("🗑️  deleted");
  }

  if (res.status === 200 && body.startsWith("hola minio")) {
    console.log("\n✅ ROUND-TRIP OK contra MinIO. Paridad de storage confirmada.");
  } else {
    console.log("\n❌ Algo falló en el round-trip.");
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error("❌ Error:", e); process.exitCode = 1; });
