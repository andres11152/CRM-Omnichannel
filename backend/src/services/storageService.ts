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
import { Upload } from "@aws-sdk/lib-storage"; 
import { AppError } from "../utils/AppError";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import os from "os";
import { getEnv } from "@/config/env";

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
 */
class S3StorageService implements IStorageService {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const env = getEnv();
    const region = env.AWS_REGION || "us-east-1";
    this.bucket = env.S3_BUCKET_NAME || "omnicrm-media";

    const accessKeyId = env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;

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
    _mimeType: string,
  ): Promise<UploadResult> {
    return { 
      url: key, 
      key, 
      provider: "s3" 
    };
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
 * LOCAL FS STORAGE IMPLEMENTATION
 */
class LocalStorageService implements IStorageService {
  private uploadDir: string;

  constructor() {
    const env = getEnv();
    this.uploadDir = env.UPLOAD_DIR || path.join(os.tmpdir(), "omnicrm_uploads");
    if (!fsSync.existsSync(this.uploadDir)) {
      fsSync.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadFile(
    companyId: string,
    buffer: Buffer,
    filename: string,
    mimeType: string,
    _isPrivate: boolean = false,
  ): Promise<UploadResult> {
    const key = `companies/${companyId}/uploads/${Date.now()}_${filename}`;
    const destinationPath = path.join(this.uploadDir, key);

    try {
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      await fs.writeFile(destinationPath, buffer);
      return { url: key, key, provider: "local" };
    } catch (error) {
      Logger.error("Local Upload Failed", error);
      throw new AppError("Local Upload Failed", 500);
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
    const destinationPath = path.join(this.uploadDir, key);

    try {
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      const writeStream = fsSync.createWriteStream(destinationPath);
      
      await new Promise((resolve, reject) => {
        stream.pipe(writeStream);
        stream.on("end", resolve);
        stream.on("error", reject);
        writeStream.on("error", reject);
      });
      return { url: key, key, provider: "local" };
    } catch (error) {
      Logger.error("Local Stream Upload Failed", error);
      throw new AppError("Local Stream Upload Failed", 500);
    }
  }

  async getSignedUrl(key: string, _expiresInSeconds: number = 900): Promise<string> {
    const env = getEnv();
    const backendUrl = env.BACKEND_URL || "http://localhost:4000";
    return `${backendUrl}/api/local-media/${key}`;
  }

  async deleteFile(key: string): Promise<void> {
    const targetPath = path.join(this.uploadDir, key);
    try {
      await fs.unlink(targetPath);
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") {
        throw new AppError("Failed to delete local file", 500);
      }
    }
  }
}

/**
 * FACTORY
 */
export const getStorageService = (): IStorageService => {
  const env = getEnv();
  const provider = (process.env.STORAGE_PROVIDER || "local").toLowerCase();
  
  if (provider === "s3" && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    return new S3StorageService();
  } else {
    return new LocalStorageService();
  }
};

export const storageService = getStorageService();

