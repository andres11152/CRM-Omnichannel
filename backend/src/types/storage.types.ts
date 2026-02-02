import { Readable } from "stream";
import { MediaType } from "@prisma/client";

/**
 * ☁️ STORAGE PROVIDER TYPES
 * Agnostic contract for file storage (Local, S3, GCS)
 */

export interface StorageUploadResult {
  key: string;
  url: string;
  mimeType: string;
  size: number;
  filename: string;
}

export interface IStorageProvider {
  upload(
    file: Express.Multer.File,
    context: { companyId: string; type: MediaType },
  ): Promise<StorageUploadResult>;

  delete(key: string): Promise<void>;
  getSignedUrl(key: string): Promise<string>;
  getStream(key: string): Promise<Readable>;
}
