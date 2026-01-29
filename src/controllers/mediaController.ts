import { Request, Response } from "express";
import { mediaService } from "@/services/mediaService";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { HTTP_STATUS } from "@/constants/httpStatus";
import Logger from "@/utils/logger"; // Assuming generalized Logger

/**
 * 🎨 MEDIA CONTROLLER
 * Decoupled controller handling media via MediaService
 */

export const mediaController = {
  /**
   * Upload File
   */
  uploadMedia: catchAsync(async (req: Request, res: Response) => {
    Logger.info("[MediaController] Upload request received");

    if (!req.file) {
      throw new AppError(
        "No se ha enviado ningún archivo",
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const { category, description, tags } = req.body;
    const companyId = req.user?.companyId;
    const userId = req.user?.id;

    if (!companyId || !userId) {
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED);
    }

    const media = await mediaService.upload({
      file: req.file,
      companyId,
      userId,
      category,
      description,
      tags,
    });

    Logger.info(`[MediaController] Upload success: ${media.id}`);

    res.status(HTTP_STATUS.CREATED).json({
      status: "success",
      data: { media },
    });
  }),

  /**
   * Get Media List
   */
  getMedia: catchAsync(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId)
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED);

    const { page = 1, limit = 20, search, type, category } = req.query;

    const result = await mediaService.list(companyId, {
      page: Number(page),
      limit: Number(limit),
      search: search as string,
      type: type as string,
      category: category as string,
    });

    res.json({
      status: "success",
      results: result.data.length,
      total: result.meta.total,
      page: result.meta.page,
      totalPages: result.meta.pages,
      data: { media: result.data },
    });
  }),

  /**
   * Get Single Media
   */
  getMediaById: catchAsync(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const { id } = req.params;

    if (!companyId)
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED);

    const media = await mediaService.get(companyId, id);

    res.json({
      status: "success",
      data: { media },
    });
  }),

  /**
   * Delete Media
   */
  deleteMedia: catchAsync(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const { id } = req.params;

    if (!companyId)
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED);

    await mediaService.delete(companyId, id);

    res.json({
      status: "success",
      message: "Archivo eliminado correctamente",
    });
  }),

  /**
   * Update Media
   */
  updateMedia: catchAsync(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const { id } = req.params;
    const { category, description, tags } = req.body;

    if (!companyId)
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED);

    const media = await mediaService.update(companyId, id, {
      category,
      description,
      tags,
    });

    res.json({
      status: "success",
      data: { media },
    });
  }),

  /**
   * Stream Content (Proxy)
   */
  getMediaContent: catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;

    const { stream, mimeType } = await mediaService.getStream(id);

    if (!stream) {
      throw new AppError("File stream unavailable", HTTP_STATUS.NOT_FOUND);
    }

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    if (typeof stream.pipe === "function") {
      stream.pipe(res);
    } else {
      // Fallback
      res.end(stream);
    }
  }),
};

// Exports compatibility
export const uploadMedia = mediaController.uploadMedia;
export const getMedia = mediaController.getMedia;
export const getMediaById = mediaController.getMediaById;
export const deleteMedia = mediaController.deleteMedia;
export const updateMedia = mediaController.updateMedia;
export const getMediaContent = mediaController.getMediaContent;
