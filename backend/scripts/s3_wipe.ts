import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * ⚠️ DESTRUCTIVO: borra TODOS los objetos del bucket S3.
 *
 * Por seguridad:
 *   - DRY RUN por defecto: solo cuenta y muestra el bucket destino.
 *   - Borra SOLO con --confirm.
 *   - Si el bucket contiene "prod", exige además --i-understand-prod.
 *
 * USO:
 *   npx ts-node -T scripts/s3_wipe.ts                                  -> dry run (cuenta)
 *   npx ts-node -T scripts/s3_wipe.ts --confirm --i-understand-prod    -> borra de verdad
 */

const APPLY = process.argv.includes("--confirm");
const PROD_ACK = process.argv.includes("--i-understand-prod");

async function main() {
  const bucket = process.env.S3_BUCKET_NAME || "";
  const region = process.env.AWS_REGION || "us-east-1";
  if (!bucket) throw new Error("S3_BUCKET_NAME no está definido en el entorno.");

  console.log(`\n🪣 Bucket destino: ${bucket}  (region: ${region})`);
  console.log(`   Modo: ${APPLY ? "🔴 BORRAR" : "🟢 DRY RUN (solo cuenta)"}`);

  if (APPLY && bucket.includes("prod") && !PROD_ACK) {
    console.log(`\n⛔ El bucket contiene "prod". Para borrarlo debes añadir también --i-understand-prod`);
    process.exit(1);
  }

  const endpoint = process.env.S3_ENDPOINT;
  const client = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
    },
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });
  if (endpoint) console.log(`   Endpoint: ${endpoint} (MinIO/local)`);

  let token: string | undefined;
  let total = 0;
  let totalBytes = 0;
  let deleted = 0;

  do {
    const list = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );
    const objs = list.Contents || [];
    total += objs.length;
    totalBytes += objs.reduce((s, o) => s + (o.Size || 0), 0);

    if (APPLY && objs.length > 0) {
      // DeleteObjects acepta hasta 1000 por llamada
      const res = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objs.map((o) => ({ Key: o.Key! })), Quiet: true },
        }),
      );
      deleted += objs.length - (res.Errors?.length || 0);
      if (res.Errors?.length) {
        console.log(`   ⚠️ ${res.Errors.length} errores en este lote:`, res.Errors.slice(0, 3));
      }
      process.stdout.write(`\r   Borrados: ${deleted}/${total}...`);
    }

    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);

  console.log("");
  console.log(`\n📊 Objetos encontrados: ${total}  (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
  if (APPLY) {
    console.log(`✅ Objetos borrados: ${deleted}`);
  } else {
    console.log(`ℹ️  DRY RUN: no se borró nada. Para borrar: --confirm${bucket.includes("prod") ? " --i-understand-prod" : ""}`);
  }
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exitCode = 1;
});
