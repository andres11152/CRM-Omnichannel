import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { UploadResult } from "../types/index";
import { Logger } from "../utils/logger";
import fs from "fs";
import path from "path";
import { Buffer } from "buffer";

// INTERFACE: The Contract
export interface IStorageService {
  uploadFile(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    isPrivate?: boolean
  ): Promise<UploadResult>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  deleteFile(key: string): Promise<void>;
}

/**
 * AWS S3 IMPLEMENTATION
 * Scalable, Secure, Durable.
 */
class S3StorageService implements IStorageService {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const region = process.env.AWS_REGION || "us-east-1";
    this.bucket =
      process.env.S3_BUCKET_NAME ||
      process.env.AWS_S3_BUCKET ||
      "omnicrm-media";

    // In Node.js, AWS SDK automatically loads credentials from process.env.AWS_ACCESS_KEY_ID, etc.
    this.client = new S3Client({ region });
  }

  async uploadFile(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    isPrivate: boolean = false
  ): Promise<UploadResult> {
    const key = `uploads/${Date.now()}_${filename}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      // Note: Bucket Policy handles public access, not ACL
    });

    try {
      await this.client.send(command);

      // ✅ PRODUCTION BEST PRACTICE: Use Signed URLs for private media
      // Files remain private, URLs expire in 24h
      let url: string;

      if (
        mimeType.startsWith("audio/") ||
        mimeType.startsWith("video/") ||
        mimeType.startsWith("image/")
      ) {
        // Generate signed URL (valid for 24 hours)
        url = await this.getSignedUrl(key, 86400);
      } else {
        // Direct URL for other files
        url = `https://${this.bucket}.s3.amazonaws.com/${key}`;
      }

      return { url, key, provider: "s3" };
    } catch (error) {
      Logger.error("S3 Upload Failed", error);
      throw error;
    }
  }

  async getSignedUrl(
    key: string,
    expiresInSeconds: number = 900
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    // Generate a temporary URL valid for 15 mins (900s)
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async deleteFile(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    );
  }
}

/**
 * LOCAL IMPLEMENTATION (Mock)
 * For development when no Internet or AWS Keys are available.
 */
class LocalStorageService implements IStorageService {
  private uploadDir = path.resolve("uploads");

  constructor() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadFile(
    buffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<UploadResult> {
    const key = `${Date.now()}_${filename}`;
    const filePath = path.join(this.uploadDir, key);

    fs.writeFileSync(filePath, buffer);

    // Return absolute URL for frontend
    const baseUrl = process.env.BACKEND_URL || "http://localhost:4000";
    return { url: `${baseUrl}/uploads/${key}`, key, provider: "local" };
  }

  async getSignedUrl(key: string): Promise<string> {
    return `/uploads/${key}`; // Local doesn't support signing really
  }

  async deleteFile(key: string): Promise<void> {
    const filePath = path.join(this.uploadDir, key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

/**
 * FACTORY
 * Returns the correct service based on environment.
 */
export const getStorageService = (): IStorageService => {
  if (process.env.STORAGE_PROVIDER === "s3") {
    return new S3StorageService();
  }
  return new LocalStorageService();
};

export const storageService = getStorageService();
