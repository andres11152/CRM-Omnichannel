import { Media, MediaType, User } from "@prisma/client";

/**
 * 📦 MEDIA DTOs
 */

export interface MediaDTO {
  id: string;
  companyId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  key: string;
  type: MediaType; // IMAGE | AUDIO | VIDEO | DOCUMENT
  category: string | null;
  tags: string[];
  description: string | null;
  uploadedById: string;
  uploadedBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export const toMediaDTO = (
  media: Media & { uploadedBy?: Partial<User> | null },
): MediaDTO => {
  return {
    id: media.id,
    companyId: media.companyId,
    filename: media.filename,
    originalName: media.originalName,
    mimeType: media.mimeType,
    size: media.size,
    url: media.url, // Service should ensure this is signed/proxied before mapping
    key: media.key,
    type: media.type, // CRITICAL: Must include type for frontend rendering
    category: media.category,
    tags: media.tags,
    description: media.description,
    uploadedById: media.uploadedById,
    uploadedBy: media.uploadedBy
      ? {
          id: media.uploadedBy.id!,
          name: media.uploadedBy.name || null,
          email: media.uploadedBy.email!,
        }
      : null,
    createdAt: media.createdAt.toISOString(),
    updatedAt: media.updatedAt.toISOString(),
  };
};
