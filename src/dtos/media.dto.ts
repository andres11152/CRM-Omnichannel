import { Media, User } from "@prisma/client";

/**
 * 📦 MEDIA DTOs
 */

export interface MediaDTO {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  category: string | null;
  tags: string[];
  description: string | null;
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
    originalName: media.originalName,
    mimeType: media.mimeType,
    size: media.size,
    url: media.url, // Service should ensure this is signed/proxied before mapping
    category: media.category,
    tags: media.tags,
    description: media.description,
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
