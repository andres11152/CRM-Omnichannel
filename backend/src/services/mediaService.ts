import { AppError } from "@/utils/AppError";
import { HTTP_STATUS } from "@/constants/httpStatus";
import { storageProvider } from "@/providers/StorageProvider";
import { planLimitsService } from "@/services/planLimitsService";
import { validateFileType, validateFileSize } from "@/services/uploadService";
import { toMediaDTO, MediaDTO } from "@/types/media.types";
import { Media, MediaType, Prisma } from "@prisma/client";
import { Readable } from "stream";
import { MediaCategory } from "@/constants/mediaCategories";
import { Logger } from "@/utils/logger";
import { mediaRepository } from "@/repositories/MediaRepository";

// Helper to map string types to Prisma Enum safely
const toMediaType = (type: string): MediaType => {
  const upper = type.toUpperCase();
  if (upper === "IMAGE") return MediaType.IMAGE;
  if (upper === "VIDEO") return MediaType.VIDEO;
  if (upper === "AUDIO") return MediaType.AUDIO;
  return MediaType.DOCUMENT;
};

interface UploadMediaParams {
  file: Express.Multer.File;
  category?: string;
  description?: string;
  tags?: string | string[];
  userId: string;
  companyId: string;
}

interface MediaFilterParams {
  type?: string;
  category?: string;
  categories?: string[];
  search?: string;
  page: number;
  limit: number;
  excludeCategories?: string[];
}

export const mediaService = {
  /**
   * Upload and save media
   */
  async upload(params: UploadMediaParams): Promise<MediaDTO> {
    const { file, companyId, userId, tags } = params;

    // 1. Validations
    const typeValidation = validateFileType(file);
    if (!typeValidation.isValid) {
      throw new AppError(
        `Invalid file type: ${typeValidation.error}`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const sizeValidation = validateFileSize(file, typeValidation.type!);
    if (!sizeValidation.isValid) {
      throw new AppError(
        `File too large: ${sizeValidation.error}`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // 2. Plan Limits
    const canUpload = await planLimitsService.canCreateResource(
      companyId,
      "storage",
      file.size,
    );
    if (!canUpload) {
      throw new AppError(
        "Storage limit exceeded. Upgrade plan.",
        HTTP_STATUS.FORBIDDEN,
      );
    }

    // Prepare MediaType
    const mediaType = toMediaType(typeValidation.type!);

    // 3. Upload to Storage
    Logger.info("[MediaService] Uploading to Storage...");
    const uploadResult = await storageProvider.upload(file, {
      companyId,
      type: mediaType,
    });
    Logger.info("[MediaService] Storage upload complete.");

    // 4. Parse Tags
    Logger.info("[MediaService] Parse Tags...");
    let tagArray: string[] = [];
    if (tags) {
      if (Array.isArray(tags)) tagArray = tags;
      else {
        try {
          const parsed = JSON.parse(tags);
          tagArray = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          tagArray = [tags];
        }
      }
    }

    // 5. Save to DB via Repository
    Logger.info("[MediaService] Saving to DB...");
    const media = await mediaRepository.createFull({
      data: {
        companyId,
        filename: uploadResult.filename,
        originalName: file.originalname,
        mimeType: uploadResult.mimeType,
        size: uploadResult.size,
        url: uploadResult.url,
        key: uploadResult.key,
        type: mediaType,
        category: params.category || null,
        tags: tagArray,
        description: params.description || null,
        uploadedById: userId,
      },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });
    Logger.info("[MediaService] Database entry created.");

    // 6. Sign URL if needed (Abstraction)
    const viewUrl = await this.resolveUrl(media);

    return toMediaDTO({ ...media, url: viewUrl });
  },

  /**
   * List media for library view
   */
  async list(companyId: string, params: MediaFilterParams) {
    const {
      page,
      limit,
      search,
      type,
      category,
      categories,
      excludeCategories = [
        MediaCategory.VOICE_NOTES,
        MediaCategory.CHAT_ATTACHMENTS,
      ],
    } = params;
    const skip = (page - 1) * limit;

    // Build category filter
    let categoryFilter: Prisma.MediaWhereInput = {};

    if (category) {
      categoryFilter = { category };
    } else if (categories && categories.length > 0) {
      categoryFilter = { category: { in: categories } };
    }

    // Build exclusion filter
    let exclusionFilter: Prisma.MediaWhereInput = {};
    if (excludeCategories && excludeCategories.length > 0) {
      exclusionFilter = {
        OR: [{ category: { notIn: excludeCategories } }, { category: null }],
      };
    }

    const where: Prisma.MediaWhereInput = {
      companyId,
      ...(type && { type: toMediaType(type) }),
      ...categoryFilter,
      ...exclusionFilter,
      ...(search && {
        OR: [
          { originalName: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { tags: { has: search } },
        ],
      }),
    };

    const [mediaList, total] = await Promise.all([
      mediaRepository.findMany({
        where,
        include: {
          uploadedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      mediaRepository.count({ where }),
    ]);

    // Resolve URLs for list
    const resolvedList = await Promise.all(
      mediaList.map(async (m) => ({
        ...m,
        url: await this.resolveUrl(m),
      })),
    );

    return {
      data: resolvedList.map(toMediaDTO),
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  },

  /**
   * Get single media
   */
  async get(companyId: string, mediaId: string): Promise<MediaDTO> {
    const media = await mediaRepository.findFirst({
      where: { id: mediaId, companyId },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!media) throw new AppError("Media not found", HTTP_STATUS.NOT_FOUND);

    const url = await this.resolveUrl(media);
    return toMediaDTO({ ...media, url });
  },

  /**
   * Delete media
   */
  async delete(companyId: string, mediaId: string): Promise<void> {
    const media = await mediaRepository.findFirst({
      where: { id: mediaId, companyId },
    });
    if (!media) throw new AppError("Media not found", HTTP_STATUS.NOT_FOUND);

    // Delete from storage
    await storageProvider.delete(media.key);

    // Delete from DB via repository
    await mediaRepository.delete(mediaId);
  },

  /**
   * Update Metadata
   */
  async update(
    companyId: string,
    mediaId: string,
    data: { category?: string; description?: string; tags?: string[] },
  ): Promise<MediaDTO> {
    const media = await mediaRepository.findFirst({
      where: { id: mediaId, companyId },
    });
    if (!media) throw new AppError("Media not found", HTTP_STATUS.NOT_FOUND);

    const updated = await mediaRepository.update({
      where: { id: mediaId },
      data,
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });

    const url = await this.resolveUrl(updated);
    return toMediaDTO({ ...updated, url });
  },

  /**
   * Helper: Resolve URL (Always use proxy for reliability)
   */
  async resolveUrl(media: Media): Promise<string> {
    if (
      media.url.includes("s3.amazonaws.com") ||
      media.key.includes("/") ||
      media.key.includes("\\")
    ) {
      const proxyUrl = `/api/media/${media.id}/content`;
      Logger.info(`[MediaService] resolveUrl: ${media.id} -> ${proxyUrl}`);
      return proxyUrl;
    }
    return media.url;
  },

  /**
   * Get Stream for Proxy
   */
  async getStream(
    mediaId: string,
    companyId?: string,
  ): Promise<{ stream: Readable; mimeType: string }> {
    const where: { id: string; companyId?: string } = { id: mediaId };
    if (companyId) where.companyId = companyId;

    const media = await mediaRepository.findFirst({ where });
    if (!media) throw new AppError("Media not found", HTTP_STATUS.NOT_FOUND);

    const stream = await storageProvider.getStream(media.key);
    return { stream, mimeType: media.mimeType };
  },
};
