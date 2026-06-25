import { S3Client } from "@aws-sdk/client-s3";

/**
 * S3 Configuration for media storage
 */

export const s3Config = {
  region: process.env.AWS_REGION || "us-east-1",
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
  // MinIO/local: endpoint custom + path-style si S3_ENDPOINT está definido.
  ...(process.env.S3_ENDPOINT
    ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
    : {}),
};

// Only initialize S3 client if credentials are provided
export const s3Client =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? new S3Client(s3Config)
    : null;

export const BUCKET_NAME = process.env.S3_BUCKET_NAME || "reply-media";
export const USE_S3 = !!s3Client;
