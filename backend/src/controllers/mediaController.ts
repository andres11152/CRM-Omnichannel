import { Response } from "express";
import { mediaRepository } from "@/repositories/MediaRepository";
import { storageService } from "@/services/StorageService";
import { Logger } from "@/utils/logger";
import { AuthenticatedRequest, MediaType } from "@/types/types";
import TenantContextManager from "@/config/tenantContext";

/**
 *  MEDIA CONTROLLER (Audit Hardened)
 * 
 * Central orchestrator for the Multimedia Library.
 * Enforces multi-tenant isolation and secure JIT S3 access.
 */

/**
 *  PUBLIC PROXY: getMediaContent
 * Serves media binary via an authenticated redirect to a JIT Signed URL.
 */
export const getMediaContent = async (req: AuthenticatedRequest, res: Response): Promise<Response | void> => {
  const { id: mediaId } = req.params;
  const userCompanyId = req.user?.companyId;

  try {
    // Public proxy: query by ID only. If user is authenticated, also enforce tenant.
    // [SEC] Must use TenantContextManager to bypass RLS when accessed globally via <img> tags
    const media = await TenantContextManager.run(
      { companyId: userCompanyId || "__SYSTEM__", userId: req.user?.id || "PUBLIC", requestId: "media-proxy" },
      async () => {
        return userCompanyId
          ? await mediaRepository.findById(mediaId, userCompanyId, { id: true, key: true, companyId: true })
          : await mediaRepository.findFirst({ where: { id: mediaId }, select: { id: true, key: true, companyId: true } });
      }
    );

    if (!media) return res.status(404).json({ error: "Media not found" });

    // Enforce Tenant Access only for authenticated users
    if (userCompanyId && media.companyId !== userCompanyId) {
      Logger.warn(`[MediaProxy] Tenant mismatch: User ${userCompanyId} accessing ${mediaId}`);
      return res.status(403).json({ error: "Access denied" });
    }

    if (!media.key) {
      Logger.error(`[MediaProxy] [ERROR] Missing storage key for media ${mediaId}`);
      return res.status(500).json({ error: "Missing file key" });
    }

    const signedUrl = await storageService.getSignedUrl(media.key, 3600);
    return res.redirect(signedUrl);
  } catch (error: unknown) {
    Logger.error(`[MediaProxy] [ERROR] Failed to proxy ${mediaId}:`, error);
    return res.status(500).json({ error: "Media server failure" });
  }
};

/**
 *  UPLOAD: uploadMedia
 * Handles manual uploads to the Multimedia Library.
 */
export const uploadMedia = async (req: AuthenticatedRequest, res: Response): Promise<Response | void> => {
  const companyId = req.user?.companyId;
  const file = req.file;

  if (!companyId) return res.status(403).json({ error: "No company context" });
  if (!file) return res.status(400).json({ error: "No file provided" });

  try {
    const filename = `${Date.now()}_${file.originalname}`;
    const uploadResult = await storageService.uploadFile(
      companyId,
      file.buffer,
      filename,
      file.mimetype
    );

    const media = await TenantContextManager.run(
      { companyId, userId: req.user.id, requestId: (req.headers["x-request-id"] as string) || "media-upload" },
      () => mediaRepository.create({
        company: { connect: { id: companyId } },
        filename: uploadResult.key,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: uploadResult.url,
        key: uploadResult.key,
        type: mapMimeToType(file.mimetype),
        category: req.body.category || "media-library", // Default to library asset for manual uploads
        uploadedBy: { connect: { id: req.user!.id } },
      })
    );

    return res.status(201).json(media);
  } catch (error: unknown) {
    Logger.error("[MediaUpload] [ERROR] Upload failed:", error);
    const errObj = error instanceof Error ? error : new Error(String(error));
    return res.status(500).json({ error: "Upload failed", details: errObj.message });
  }
};

/**
 * [SEARCH] LIST: getMedia
 */
export const getMedia = async (req: AuthenticatedRequest, res: Response): Promise<Response | void> => {
  const companyId = req.user?.companyId;
  if (!companyId) return res.status(403).json({ error: "No company context" });

  const { type, category, search } = req.query as { type?: MediaType; category?: string; search?: string };

  try {
    const categories = category 
      ? (Array.isArray(category) ? category : [category])
      : (type === MediaType.AUDIO 
          ? ["media-library", "template-assets"] 
          : ["media-library", "template-assets", "chat-attachments", "RAG", "KNOWLEDGE_BASE"]);

    const mediaList = await mediaRepository.findMany({
      where: { 
        companyId,
        type: type || undefined,
        // ENTERPRISE FILTER: 
        // - Audio: Only show permanent recordings (library/templates).
        // - Other: Show library, templates, and chat-attachments.
        category: { in: categories },
        originalName: search ? { contains: search, mode: "insensitive" } : undefined,
      },
      orderBy: { createdAt: "desc" },
    });
    return res.json(mediaList);
  } catch (error: unknown) {
    Logger.error("[MediaList] [ERROR] Failed to fetch media:", error);
    return res.status(500).json({ error: "Failed to fetch media" });
  }
};

/**
 * 🆔 READ: getMediaById
 */
export const getMediaById = async (req: AuthenticatedRequest, res: Response): Promise<Response | void> => {
  const { id } = req.params;
  const companyId = req.user?.companyId;
  if (!companyId) return res.status(403).json({ error: "No company context" });

  try {
    const media = await mediaRepository.findFirst({
      where: { id, companyId },
    });
    if (!media) return res.status(404).json({ error: "Media not found" });
    return res.json(media);
  } catch (error: unknown) {
    Logger.error(`[MediaById] [ERROR] Database error for ${id}:`, error);
    return res.status(500).json({ error: "Database error" });
  }
};

/**
 *  UPDATE: updateMedia
 */
export const updateMedia = async (req: AuthenticatedRequest, res: Response): Promise<Response | void> => {
  const { id } = req.params;
  const companyId = req.user?.companyId;
  const { description, category, tags } = req.body as { description?: string; category?: string; tags?: string[] };

  if (!companyId) return res.status(403).json({ error: "No company context" });

  try {
    const media = await mediaRepository.update({
      where: { id, companyId },
      data: { description, category, tags },
    });
    return res.json(media);
  } catch (error: unknown) {
    Logger.error(`[MediaUpdate] [ERROR] Update failed for ${id}:`, error);
    return res.status(500).json({ error: "Update failed" });
  }
};

/**
 * ️ DELETE: deleteMedia
 */
export const deleteMedia = async (req: AuthenticatedRequest, res: Response): Promise<Response | void> => {
  const { id } = req.params;
  const companyId = req.user?.companyId;
  if (!companyId) return res.status(403).json({ error: "No company context" });

  try {
    const media = await mediaRepository.findFirst({ where: { id, companyId } });
    if (!media) return res.status(404).json({ error: "Media not found" });

    await storageService.deleteFile(media.key);
    await mediaRepository.delete(id, companyId);

    return res.json({ message: "Media deleted successfully" });
  } catch (error: unknown) {
    Logger.error(`[MediaDelete] [ERROR] Deletion failed for ${id}:`, error);
    return res.status(500).json({ error: "Deletion failed" });
  }
};

// --- Helpers ---
function mapMimeToType(mime?: string): MediaType {
  if (!mime) return MediaType.DOCUMENT;
  const lowerMime = mime.toLowerCase();
  if (lowerMime.startsWith("image/")) return MediaType.IMAGE;
  if (lowerMime.startsWith("audio/")) return MediaType.AUDIO;
  if (lowerMime.startsWith("video/")) return MediaType.VIDEO;
  return MediaType.DOCUMENT;
}
