import { Readable } from "stream";
import { MediaType } from "@prisma/client";
import {
  uploadFile,
  deleteFile,
  getSignedUrl,
  getFileStream,
} from "@/services/uploadService";
import { IStorageProvider, StorageUploadResult } from "@/types/storage.types";

/**
 * 🔌 ADAPTER IMPLEMENTATION
 * Wraps existing uploadService logic into a clean provider class.
 */
export class DefaultStorageProvider implements IStorageProvider {
  async upload(
    file: Express.Multer.File,
    context: { companyId: string; type: MediaType },
  ): Promise<StorageUploadResult> {
    // Now type-safe as uploadService uses MediaType
    const result = await uploadFile(file, context);

    return {
      key: result.key,
      url: result.url,
      mimeType: result.mimeType,
      size: result.size,
      filename: result.filename,
    };
  }

  async delete(key: string): Promise<void> {
    await deleteFile(key);
  }

  async getSignedUrl(key: string): Promise<string> {
    try {
      return await getSignedUrl(key);
    } catch {
      return key;
    }
  }

  async getStream(key: string): Promise<Readable> {
    return await getFileStream(key);
  }
}

export const storageProvider = new DefaultStorageProvider();
