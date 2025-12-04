import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import path from "path";

// Load env from root
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const run = async () => {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET_NAME;

  console.log("--- S3 Access Test ---");
  console.log(`Region: ${region}`);
  console.log(`Bucket: ${bucket}`);
  console.log(
    `Access Key: ${accessKeyId ? "******" + accessKeyId.slice(-4) : "MISSING"}`
  );

  if (!accessKeyId || !secretAccessKey || !bucket || !region) {
    console.error("❌ Missing configuration in .env");
    return;
  }

  const client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    console.log(`\n1. Testing Bucket Access (HeadBucket)...`);
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log("✅ Bucket found and accessible!");

    console.log(`\n2. Testing Write Access (PutObject)...`);
    const testKey = "access-check.txt";
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: testKey,
        Body: "Access check successful",
      })
    );
    console.log("✅ Write successful!");
    console.log("\n🎉 Your credentials work correctly!");
  } catch (error: any) {
    console.error("\n❌ Access Test Failed:");
    if (error.name === "NotFound") {
      console.error("Bucket not found. Check the name and region.");
    } else if (
      error.name === "Forbidden" ||
      error.$metadata?.httpStatusCode === 403
    ) {
      console.error(
        "Access Denied. The user does NOT have permission for this bucket."
      );
    } else {
      console.error(error.message);
    }
  }
};

run();
