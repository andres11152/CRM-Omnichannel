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

const MAX_STREAM_UPLOAD_BYTES = 64 * 1024 * 1024; // WhatsApp's own media cap

/**
 * [DOCS · Node streams] A Readable can only be consumed once. uploadStream used to
 * pass the SAME stream to the S3 attempt and, on failure, to the local-storage
 * fallback — the fallback silently wrote an empty/truncated file (S3 had already
 * drained or aborted the stream) while still reporting a successful upload. This
 * buffers once up front so every destination gets its own fresh Readable.
 */
const bufferStream = (stream: Readable): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_STREAM_UPLOAD_BYTES) {
        stream.destroy();
        reject(new Error(`Stream exceeded max upload size of ${MAX_STREAM_UPLOAD_BYTES} bytes`));
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => {
      const buffer = Buffer.concat(chunks);
      if (buffer.length === 0) {
        reject(new Error("Stream ended with 0 bytes — refusing to upload an empty file"));
        return;
      }
      resolve(buffer);
    });
    stream.on("error", reject);
  });

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
  private localFallback?: LocalStorageService;

  private getFallback(): LocalStorageService {
    if (!this.localFallback) {
      this.localFallback = new LocalStorageService();
    }
    return this.localFallback;
  }

  constructor() {
    const env = getEnv();
    const region = env.AWS_REGION || "us-east-1";
    this.bucket = env.S3_BUCKET_NAME || "omnicrm-media";

    const accessKeyId = env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      Logger.warn("[StorageService] AWS Credentials missing. S3 will fail.");
    }

    // MinIO/local: si hay endpoint custom, usarlo con path-style (bucket en el
    // path, no en el host). Sin S3_ENDPOINT → AWS real (prod intacto).
    const endpoint = env.S3_ENDPOINT;
    this.client = new S3Client({
      region,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
  }

  async uploadFile(
    companyId: string,
    buffer: Buffer,
    filename: string,
    mimeType: string,
    isPrivate: boolean = false,
  ): Promise<UploadResult> {
    const key = `companies/${companyId}/uploads/${Date.now()}_${filename}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 seconds timeout

    try {
      await this.client.send(command, { abortSignal: controller.signal });
      return this.generateResult(key, mimeType);
    } catch (error) {
      Logger.warn(
        `[StorageService] S3 Upload failed (Timeout/Network/Credentials). Falling back to LocalStorage. Error: ${
          error instanceof Error ? error.message : error
        }`
      );
      return this.getFallback().uploadFile(companyId, buffer, filename, mimeType, isPrivate);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async uploadStream(
    companyId: string,
    stream: Readable,
    filename: string,
    mimeType: string,
    isPrivate: boolean = false,
  ): Promise<UploadResult> {
    const key = `companies/${companyId}/uploads/${Date.now()}_${filename}`;

    // [SEC] Buffer once: a Readable can only be drained once, so the SAME stream
    // can never be reused for the S3 attempt AND the local fallback (see
    // bufferStream's doc comment). Each destination below gets its own fresh
    // Readable.from(buffer).
    const buffer = await bufferStream(stream);

    let timeoutId: NodeJS.Timeout | undefined;
    try {
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: Readable.from(buffer),
          ContentType: mimeType,
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          upload.abort();
          reject(new Error("S3 Stream Upload timed out after 10 seconds"));
        }, 10000);
      });

      await Promise.race([upload.done(), timeoutPromise]);
      if (timeoutId) clearTimeout(timeoutId);
      return this.generateResult(key, mimeType);
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      Logger.warn(
        `[StorageService] S3 Stream Upload failed. Falling back to LocalStorage. Error: ${
          error instanceof Error ? error.message : error
        }`
      );
      return this.getFallback().uploadStream(companyId, Readable.from(buffer), filename, mimeType, isPrivate);
    }
  }

  private async generateResult(
    key: string,
    _mimeType: string,
  ): Promise<UploadResult> {
    return { 
      url: `/${key}`, 
      key, 
      provider: "s3" 
    };
  }

  async getSignedUrl(
    key: string,
    expiresInSeconds: number = 900,
  ): Promise<string> {
    // Check if the file exists locally as a fallback
    const localDir = getEnv().UPLOAD_DIR || path.join(os.tmpdir(), "omnicrm_uploads");
    const localPath = path.join(localDir, key);
    try {
      await fs.access(localPath);
      // It exists locally! Return local URL
      return this.getFallback().getSignedUrl(key, expiresInSeconds);
    } catch {
      // It doesn't exist locally, proceed with S3
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
    }
  }

  async deleteFile(key: string): Promise<void> {
    // Attempt local deletion if it exists
    try {
      await this.getFallback().deleteFile(key);
    } catch {
      // Ignore local delete errors
    }

    // Attempt S3 deletion with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: controller.signal }
      );
    } catch (error) {
      Logger.error(`[StorageService] S3 Delete Failed: ${error instanceof Error ? error.message : error}`);
    } finally {
      clearTimeout(timeoutId);
    }
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
      return { url: `/api/local-media/${key}`, key, provider: "local" };
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
      return { url: `/api/local-media/${key}`, key, provider: "local" };
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

