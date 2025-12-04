import { Response } from "express";
import { AuthenticatedRequest } from "../types/types";
import { prisma } from "../config/prisma";
import {
  uploadFile,
  deleteFile,
  validateFileType,
  validateFileSize,
  getSignedUrl,
} from "../services/uploadService";

/**
 * Upload media file
 * POST /api/media/upload
 */
import fs from "fs";
import path from "path";

export const uploadMedia = async (req: AuthenticatedRequest, res: Response) => {
  const logFile = path.join(process.cwd(), "debug_upload.log");
  const log = (msg: string) => {
    try {
      fs.appendFileSync(logFile, `${new Date().toISOString()} - ${msg}\n`);
    } catch (e) {
      console.error("Error writing to log file:", e);
    }
  };

  try {
    log("[Upload] Starting upload...");
    log(`[Upload] req.user: ${JSON.stringify(req.user)}`);
    log(`[Upload] req.companyId: ${req.companyId}`);
    log(`[Upload] req.file: ${req.file ? "File present" : "No file"}`);

    const file = req.file;
    const { category, description, tags } = req.body;
    const companyId = req.user?.companyId || req.companyId;
    const userId = req.user?.id;

    log(`[Upload] Extracted companyId: ${companyId}`);
    log(`[Upload] Extracted userId: ${userId}`);

    if (!companyId) {
      log("[Upload] Error: Company ID is missing!");
      return res.status(400).json({ message: "Company ID is missing" });
    }

    if (!userId) {
      log("[Upload] Error: User ID is missing!");
      return res.status(401).json({ message: "User ID is missing" });
    }

    if (!file) {
      log("[Upload] Error: No file provided!");
      return res
        .status(400)
        .json({ message: "No se ha enviado ningún archivo" });
    }

    // Validate file type
    const typeValidation = validateFileType(file);
    if (!typeValidation.isValid) {
      log(`[Upload] Error: Invalid file type - ${typeValidation.error}`);
      return res.status(400).json({ message: typeValidation.error });
    }

    // Validate file size
    const sizeValidation = validateFileSize(file, typeValidation.type!);
    if (!sizeValidation.isValid) {
      log(`[Upload] Error: Invalid file size - ${sizeValidation.error}`);
      return res.status(400).json({ message: sizeValidation.error });
    }

    // Upload file
    log("[Upload] Calling uploadFile service...");
    const uploadResult = await uploadFile(file, {
      companyId,
      type: typeValidation.type!,
    });
    log(`[Upload] Upload successful: ${JSON.stringify(uploadResult)}`);

    // Parse tags if provided
    let tagArray: string[] = [];
    if (tags) {
      try {
        if (Array.isArray(tags)) {
          tagArray = tags;
        } else {
          tagArray = JSON.parse(tags);
        }
      } catch (e) {
        tagArray = typeof tags === "string" ? [tags] : [];
      }
    }

    // Save to database
    log("[Upload] Saving to database...");
    const media = await prisma.media.create({
      data: {
        companyId,
        filename: uploadResult.filename,
        originalName: file.originalname,
        mimeType: uploadResult.mimeType,
        size: uploadResult.size,
        url: uploadResult.url,
        key: uploadResult.key,
        type: typeValidation.type as any,
        category: category || null,
        tags: tagArray,
        description: description || null,
        uploadedById: userId,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
    log("[Upload] Database save successful");

    res.status(201).json({
      status: "success",
      data: { media },
    });
  } catch (error) {
    log(`[Upload] ERROR: ${error}`);
    if (error instanceof Error) {
      log(`[Upload] Stack: ${error.stack}`);
    }

    console.error("[Upload] ERROR uploading media:");
    console.error(error);

    res.status(500).json({
      message: "Error al subir el archivo",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
};

/**
 * Get all media for company
 * GET /api/media
 */
export const getMedia = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = req.user?.companyId;
    const { type, category, search, page = 1, limit = 20 } = req.query;

    if (!companyId) {
      return res.status(400).json({ message: "Company ID is missing" });
    }

    const where: any = { companyId };

    if (type) {
      where.type = type;
    }

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { originalName: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { tags: { has: search } },
      ];
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Number(limit));
    const skip = (pageNum - 1) * limitNum;

    const [media, total] = await Promise.all([
      prisma.media.findMany({
        where,
        include: {
          uploadedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.media.count({ where }),
    ]);

    // Generate signed URLs for S3 files
    const mediaWithSignedUrls = await Promise.all(
      media.map(async (m) => {
        if (m.url.includes("s3.amazonaws.com")) {
          const signedUrl = await getSignedUrl(m.key);
          return { ...m, url: signedUrl };
        }
        return m;
      })
    );

    res.status(200).json({
      status: "success",
      results: media.length,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      data: { media: mediaWithSignedUrls },
    });
  } catch (error) {
    console.error("Error fetching media:", error);
    res
      .status(500)
      .json({ message: "Error al obtener archivos", error: String(error) });
  }
};

/**
 * Get single media by ID
 * GET /api/media/:id
 */
export const getMediaById = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    const media = await prisma.media.findFirst({
      where: { id, companyId },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!media) {
      return res.status(404).json({ message: "Archivo no encontrado" });
    }

    // Generate signed URL if S3
    if (media.url.includes("s3.amazonaws.com")) {
      const signedUrl = await getSignedUrl(media.key);
      (media as any).url = signedUrl;
    }

    res.status(200).json({
      status: "success",
      data: { media },
    });
  } catch (error) {
    console.error("Error fetching media:", error);
    res
      .status(500)
      .json({ message: "Error al obtener archivo", error: String(error) });
  }
};

/**
 * Delete media
 * DELETE /api/media/:id
 */
export const deleteMedia = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    const media = await prisma.media.findFirst({
      where: { id, companyId },
    });

    if (!media) {
      return res.status(404).json({ message: "Archivo no encontrado" });
    }

    // Delete file from storage
    await deleteFile(media.key);

    // Delete from database
    await prisma.media.delete({
      where: { id },
    });

    res.status(200).json({
      status: "success",
      message: "Archivo eliminado correctamente",
    });
  } catch (error) {
    console.error("Error deleting media:", error);
    res
      .status(500)
      .json({ message: "Error al eliminar archivo", error: String(error) });
  }
};

/**
 * Update media metadata
 * PATCH /api/media/:id
 */
export const updateMedia = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { category, description, tags } = req.body;
    const companyId = req.user?.companyId;

    const media = await prisma.media.findFirst({
      where: { id, companyId },
    });

    if (!media) {
      return res.status(404).json({ message: "Archivo no encontrado" });
    }

    const updated = await prisma.media.update({
      where: { id },
      data: {
        category: category !== undefined ? category : media.category,
        description:
          description !== undefined ? description : media.description,
        tags: tags !== undefined ? tags : media.tags,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.status(200).json({
      status: "success",
      data: { media: updated },
    });
  } catch (error) {
    console.error("Error updating media:", error);
    res
      .status(500)
      .json({ message: "Error al actualizar archivo", error: String(error) });
  }
};
