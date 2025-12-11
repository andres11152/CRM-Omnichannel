import {
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as awsGetSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  s3Client,
  BUCKET_NAME,
  USE_S3,
  LOCAL_UPLOAD_DIR,
  LOCAL_BASE_URL,
} from "../config/s3";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import mime from "mime-types";
import sharp from "sharp";

export interface UploadResult {
  url: string;
  key: string;
  filename: string;
  size: number;
  mimeType: string;
}

/**
 * Compress image using sharp
 */
const compressImage = async (
  buffer: Buffer,
  mimeType: string
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
  } catch (error) {
    console.error("Error compressing image:", error);
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

/**
 * Upload file to S3 or local storage
 */
export const uploadFile = async (
  file: MulterFile,
  options: {
    companyId: string;
    type: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT";
  }
): Promise<UploadResult> => {
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

  console.log(`[UploadService] USE_S3: ${USE_S3}`);
  console.log(`[UploadService] s3Client exists: ${!!s3Client}`);

  if (USE_S3 && s3Client) {
    try {
      console.log("[UploadService] Attempting S3 upload...");
      // Upload to S3
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: fileBuffer,
        ContentType: file.mimetype,
        ACL: "private", // Explicitly private
      });

      await s3Client.send(command);
      console.log("[UploadService] S3 upload successful");

      const url = `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;

      return {
        url,
        key,
        filename,
        size: fileSize,
        mimeType: file.mimetype,
      };
    } catch (error) {
      console.error(
        "[UploadService] S3 upload failed, falling back to local storage:",
        error
      );
      // Fallback to local storage logic below
    }
  }

  console.log("[UploadService] Using local storage...");
  // Fallback to local storage
  const uploadDir = path.join(
    LOCAL_UPLOAD_DIR,
    options.companyId,
    options.type.toLowerCase()
  );

  // Ensure directory exists
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const localPath = path.join(uploadDir, filename);
  fs.writeFileSync(localPath, fileBuffer);

  const url = `${LOCAL_BASE_URL}/uploads/${
    options.companyId
  }/${options.type.toLowerCase()}/${filename}`;

  return {
    url,
    key: localPath,
    filename,
    size: fileSize,
    mimeType: file.mimetype,
  };
};

/**
 * Delete file from S3 or local storage
 */
export const deleteFile = async (key: string): Promise<void> => {
  if (USE_S3 && s3Client) {
    // Delete from S3
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
  } else {
    // Delete from local storage
    if (fs.existsSync(key)) {
      fs.unlinkSync(key);
    }
  }
};

/**
 * Get Signed URL for private S3 file
 */
export const getSignedUrl = async (key: string): Promise<string> => {
  if (USE_S3 && s3Client) {
    try {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });
      // URL valid for 1 hour
      return await awsGetSignedUrl(s3Client, command, { expiresIn: 3600 });
    } catch (error) {
      console.error("Error generating signed URL:", error);
      return "";
    }
  }
  // Local fallback
  return `${LOCAL_BASE_URL}/${key}`; // Assuming key is relative path for local
};

/**
 * Validate file type
 */
export const validateFileType = (
  file: MulterFile
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
  type: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT"
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
