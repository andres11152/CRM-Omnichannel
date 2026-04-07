import multer from "multer";
import { Request, Response, NextFunction } from "express";
import { AppError } from "@/utils/AppError";

/**
 *  MULTER CONFIGURATION
 *
 * Handles file uploads for CSV/Excel import
 * Security: Memory storage (no files saved to disk), size limits, MIME type validation
 */

// Memory storage (file is kept in memory as Buffer)
// Safer than disk storage for temporary uploads
const storage = multer.memoryStorage();

// File filter: Only allow CSV and Excel files
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback,
) => {
  const allowedMimeTypes = [
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];

  const allowedExtensions = [".csv", ".xls", ".xlsx"];

  // Check MIME type
  if (allowedMimeTypes.includes(file.mimetype)) {
    callback(null, true);
    return;
  }

  // Check file extension (fallback for browsers that don't set MIME correctly)
  const fileExtension = file.originalname.toLowerCase().slice(-4);
  if (allowedExtensions.some((ext) => fileExtension.endsWith(ext))) {
    callback(null, true);
    return;
  }

  // Reject file
  callback(
    new AppError(
      "Invalid file type. Only CSV and Excel files (.csv, .xls, .xlsx) are allowed.",
      400,
    ),
  );
};

// Configure multer
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
    files: 1, // Only 1 file per request
  },
});

/**
 * Middleware for single file upload
 * Usage: router.post('/import', upload.single('file'), handler)
 */
export const uploadSingle = upload.single("file");

/**
 * Error handler for multer errors
 * Usage: Add after routes to catch multer-specific errors
 */
export const handleMulterError = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return next(new AppError("File size exceeds 5MB limit", 400));
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return next(new AppError("Only 1 file allowed per upload", 400));
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return next(new AppError("Unexpected file field name", 400));
    }
  }
  next(error);
};
