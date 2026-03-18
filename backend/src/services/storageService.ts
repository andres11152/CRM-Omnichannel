import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { UploadResult } from "../types/index";
import { Logger } from "../utils/logger";
import { Buffer } from "buffer";
import { Readable } from "stream";
import { Upload } from "@aws-sdk/lib-storage"; // Better for streaming
import { AppError } from "../utils/AppError";

// INTERFACE: The Contract
export interface IStorageService {
  uploadFile(
    companyId: string,
    buffer: Buffer,
    filename: string,
    mimeType: string,
    isPrivate?: boolean,
  ): Promise<UploadResult>;

  uploadStream(
    companyId: string,
    stream: Readable,
    filename: string,
    mimeType: string,
    isPrivate?: boolean,
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

    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      Logger.warn("[StorageService] AWS Credentials missing. S3 will fail.");
    }

    this.client = new S3Client({
      region,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
    });
  }

  async uploadFile(
    companyId: string,
    buffer: Buffer,
    filename: string,
    mimeType: string,
    _isPrivate: boolean = false,
  ): Promise<UploadResult> {
    const key = `companies/${companyId}/uploads/${Date.now()}_${filename}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });

    try {
      await this.client.send(command);
      return this.generateResult(key, mimeType);
    } catch (error) {
      Logger.error("S3 Upload Failed", error);
      throw new AppError("S3 Upload Failed", 500);
    }
  }

  async uploadStream(
    companyId: string,
    stream: Readable,
    filename: string,
    mimeType: string,
    _isPrivate: boolean = false,
  ): Promise<UploadResult> {
    const key = `companies/${companyId}/uploads/${Date.now()}_${filename}`;

    try {
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: stream,
          ContentType: mimeType,
        },
      });

      await upload.done();
      return this.generateResult(key, mimeType);
    } catch (error: unknown) {
      Logger.error("S3 Stream Upload Failed", error);
      throw new AppError("S3 Stream Upload Failed", 500);
    }
  }

  private async generateResult(
    key: string,
    mimeType: string,
  ): Promise<UploadResult> {
    let url: string;
    if (
      mimeType.startsWith("audio/") ||
      mimeType.startsWith("video/") ||
      mimeType.startsWith("image/")
    ) {
      url = await this.getSignedUrl(key, 86400);
    } else {
      url = `https://${this.bucket}.s3.amazonaws.com/${key}`;
    }
    return { url, key, provider: "s3" };
  }

  async getSignedUrl(
    key: string,
    expiresInSeconds: number = 900,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async deleteFile(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

/**
 * FACTORY
 * Returns the correct service based on environment.
 * Forcing S3 as per requirements.
 */
export const getStorageService = (): IStorageService => {
  return new S3StorageService();
};

export const storageService = getStorageService();
