import { S3Client } from "@aws-sdk/client-s3";

/**
 * S3 Configuration for media storage
 * Falls back to local storage if AWS credentials are not provided
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
};

// Only initialize S3 client if credentials are provided
export const s3Client =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? new S3Client(s3Config)
    : null;

export const BUCKET_NAME = process.env.S3_BUCKET_NAME || "reply-media";
export const USE_S3 = !!s3Client;

// Local storage configuration (fallback)
export const LOCAL_UPLOAD_DIR =
  process.env.LOCAL_UPLOAD_PATH || "./public/uploads";
export const LOCAL_BASE_URL = process.env.APP_URL || "http://localhost:4000";
