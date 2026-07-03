import {
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as awsGetSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, BUCKET_NAME, USE_S3 } from "../config/s3";
import crypto from "crypto";
import path from "path";

import sharp from "sharp";
import { getErrorMessage } from "../utils/errorHelpers";
import { AppError } from "../utils/AppError";
import { Logger } from "@/utils/logger";

export interface UploadResult {
  url: string;
  key: string;
  filename: string;
  size: number;
  mimeType: string;
}

// [SEC] FILE SIZE LIMITS (Prevent OOM)
const MAX_FILE_SIZE = {
  IMAGE: 10 * 1024 * 1024, // 10MB
  AUDIO: 25 * 1024 * 1024, // 25MB
  VIDEO: 100 * 1024 * 1024, // 100MB
  DOCUMENT: 50 * 1024 * 1024, // 50MB
} as const;

/**
 * Compress image using sharp
 */
const compressImage = async (
  buffer: Buffer,
  mimeType: string,
): Promise<Buffer> => {
  try {
    let sharpInstance = sharp(buffer);

    // Get metadata to determine orientation and size
    const metadata = await sharpInstance.metadata();

    // Auto-rotate based on EXIF data
    sharpInstance = sharpInstance.rotate();

    // Resize if image is too large (max 2000px on longest side)
    if (metadata.width && metadata.width > 2000) {
      sharpInstance = sharpInstance.resize(2000, null, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    // Compress based on format
    if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
      return await sharpInstance
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();
    } else if (mimeType === "image/png") {
      return await sharpInstance
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
    } else if (mimeType === "image/webp") {
      return await sharpInstance.webp({ quality: 85 }).toBuffer();
    }

    // For other formats (gif, etc.), return original
    return buffer;
  } catch (error: unknown) {
    const errorMsg = getErrorMessage(error);
    Logger.error("Error compressing image:", errorMsg);
    // Return original buffer if compression fails
    return buffer;
  }
};

export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

import { MediaType } from "@prisma/client";
import { Readable } from "stream";

/**
 * Upload file to S3 or local storage
 */
export const uploadFile = async (
  file: MulterFile,
  options: {
    companyId: string;
    type: MediaType;
  },
): Promise<UploadResult> => {
  try {
    // [SEC] CRITICAL: Validate file size BEFORE processing
    const maxSize = MAX_FILE_SIZE[options.type];
    if (file.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / (1024 * 1024));
      const fileSizeMB = Math.round(file.size / (1024 * 1024));
      throw new AppError(
        `File too large: ${fileSizeMB}MB. Maximum allowed: ${maxSizeMB}MB for ${options.type}`,
        413, // Payload Too Large
      );
    }

    // [SEC] Validate buffer exists
    if (!file.buffer || file.buffer.length === 0) {
      throw new AppError("File buffer is empty", 400);
    }

    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString("hex");
    const fileExtension = path.extname(file.originalname);
    const filename = `${timestamp}-${randomString}${fileExtension}`;
    const key = `${options.companyId}/${options.type.toLowerCase()}/${filename}`;

    // Compress images before upload
    let fileBuffer = file.buffer;
    let fileSize = file.size;

    if (options.type === "IMAGE") {
      fileBuffer = await compressImage(file.buffer, file.mimetype);
      fileSize = fileBuffer.length;
    }

    Logger.info(`[UploadService] Uploading file. USE_S3: ${USE_S3}`);

    if (!USE_S3 || !s3Client) {
      throw new AppError("S3 is not configured. Upload failed.", 500);
    }

    try {
      Logger.info("[UploadService] Attempting S3 upload...");
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: fileBuffer,
        ContentType: file.mimetype,
        // Using Bucket Policies instead of ACL
      });

      // [SEC] 100-YEAR FIX: Race against timeout to prevent hanging requests
      // If S3 takes >10s, throw timeout error
      await Promise.race([
        s3Client.send(command),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("S3 Upload Timeout (10s)")), 10000),
        ),
      ]);

      Logger.info("[UploadService] S3 upload successful");

      // [SEC] 100-YEAR FIX: la URL pública debe respetar el endpoint real.
      // Antes se hardcodeaba `https://<bucket>.s3.amazonaws.com/...`, lo que
      // en local (MinIO vía S3_ENDPOINT) guardaba URLs apuntando a AWS que
      // jamás cargaban. Con endpoint custom → path-style (MinIO).
      //
      // Para AWS real (sin S3_ENDPOINT) se mantiene el formato SIN región
      // `bucket.s3.amazonaws.com` — es el que ya usa el resto de la app
      // (MediaService.resolveUrl busca literalmente esa substring para
      // detectar URLs S3) y el endpoint global de AWS redirige solo a la
      // región real del bucket. Forzar una región explícita aquí rompió esa
      // detección y, si AWS_REGION no coincidía con la región real del
      // bucket en Render, las fotos de propiedades no cargaban en prod.
      const endpoint = process.env.S3_ENDPOINT?.replace(/\/$/, "");
      const url = endpoint
        ? `${endpoint}/${BUCKET_NAME}/${key}`
        : `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;

      return {
        url,
        key,
        filename,
        size: fileSize,
        mimeType: file.mimetype,
      };
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      Logger.error("[UploadService] S3 upload failed:", errorMsg);
      throw new AppError(`S3 Upload failed: ${errorMsg}`, 500);
    }
  } catch (error: unknown) {
    const errorMsg = getErrorMessage(error);
    Logger.error(`[UploadService] Fatal Upload Error:`, errorMsg);
    if (error instanceof AppError) throw error;
    throw new AppError(`Upload failed: ${errorMsg}`, 500);
  }
};

/**
 * Delete file from S3 or local storage
 */
export const deleteFile = async (key: string): Promise<void> => {
  if (!USE_S3 || !s3Client) {
    throw new AppError("S3 is not configured. Cannot delete file.", 500);
  }

  // Delete from S3
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
};

/**
 * Get Signed URL for private S3 file
 */
export const getSignedUrl = async (key: string): Promise<string> => {
  if (!USE_S3 || !s3Client) {
    throw new AppError("S3 is not configured. Cannot get signed URL.", 500);
  }

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    // URL valid for 1 hour
    return await awsGetSignedUrl(s3Client, command, { expiresIn: 3600 });
  } catch (error: unknown) {
    Logger.error("Error generating signed URL:", error);
    return "";
  }
};

/**
 * Get file stream from S3 or local storage
 * AWS SDK v3 requires special handling for streams
 */
export const getFileStream = async (key: string): Promise<Readable> => {
  if (!USE_S3 || !s3Client) {
    throw new AppError("S3 is not configured. Cannot get file stream.", 500);
  }

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new AppError(`File not found in S3: ${key}`, 404);
    }

    // AWS SDK v3 returns a special stream type
    // We need to convert it to a Node.js Readable stream
    const sdkStream = response.Body;

    // If it's already a Readable stream, return it
    if (sdkStream instanceof Readable) {
      return sdkStream;
    }

    // If it has transformToWebStream method (AWS SDK v3), convert it
    if (
      typeof (sdkStream as { transformToByteArray?: () => Promise<Uint8Array> })
        .transformToByteArray === "function"
    ) {
      const bytes = await (
        sdkStream as { transformToByteArray: () => Promise<Uint8Array> }
      ).transformToByteArray();
      const readable = new Readable();
      readable.push(Buffer.from(bytes));
      readable.push(null);
      return readable;
    }

    // Fallback: try to use it as-is (may work for some stream types)
    return sdkStream as unknown as Readable;
  } catch (error) {
    Logger.error(`[getFileStream] S3 error for key ${key}:`, error);
    throw new AppError(`Failed to get file from S3: ${key}`, 500);
  }
};

/**
 * Validate file type
 */
export const validateFileType = (
  file: MulterFile,
): {
  isValid: boolean;
  type?: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT";
  error?: string;
} => {
  const mimeType = file.mimetype;

  // Image validation
  if (mimeType.startsWith("image/")) {
    const allowedImageTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    if (allowedImageTypes.includes(mimeType)) {
      return { isValid: true, type: "IMAGE" };
    }
    return {
      isValid: false,
      error: "Tipo de imagen no permitido. Usa JPG, PNG, GIF o WebP.",
    };
  }

  // Audio validation
  if (mimeType.startsWith("audio/")) {
    const allowedAudioTypes = [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/ogg",
      "audio/mp4",
      "audio/x-m4a",
      "audio/webm", // CRITICAL for Voice Notes recorded in browser
    ];
    if (allowedAudioTypes.includes(mimeType)) {
      return { isValid: true, type: "AUDIO" };
    }
    return {
      isValid: false,
      error: "Tipo de audio no permitido. Usa MP3, WAV, OGG o M4A.",
    };
  }

  // Video validation
  if (mimeType.startsWith("video/")) {
    const allowedVideoTypes = [
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/x-msvideo",
    ];
    if (allowedVideoTypes.includes(mimeType)) {
      return { isValid: true, type: "VIDEO" };
    }
    return {
      isValid: false,
      error: "Tipo de video no permitido. Usa MP4, WebM o MOV.",
    };
  }

  // Document validation
  const allowedDocTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
  ];

  if (allowedDocTypes.includes(mimeType)) {
    return { isValid: true, type: "DOCUMENT" };
  }

  return { isValid: false, error: "Tipo de archivo no permitido." };
};

/**
 * Validate file size based on type
 */
export const validateFileSize = (
  file: MulterFile,
  type: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT",
): { isValid: boolean; error?: string } => {
  const sizeLimits = {
    IMAGE: 10 * 1024 * 1024, // 10MB
    AUDIO: 25 * 1024 * 1024, // 25MB
    VIDEO: 100 * 1024 * 1024, // 100MB
    DOCUMENT: 50 * 1024 * 1024, // 50MB
  };

  const limit = sizeLimits[type];

  if (file.size > limit) {
    return {
      isValid: false,
      error: `Archivo demasiado grande. Máximo permitido: ${
        limit / (1024 * 1024)
      }MB`,
    };
  }

  return { isValid: true };
};
