import { api, ApiResponse } from "@/lib/axios";

export interface Media {
  id: string;
  companyId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  key: string;
  type: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT";
  category?: string;
  tags: string[];
  description?: string;
  uploadedById: string;
  uploadedBy: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface UploadMediaData {
  file: File;
  category?: string;
  description?: string;
  tags?: string[];
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

/**
 * Normalizes media URLs to be absolute
 */
const normalizeMedia = (media: Media): Media => {
  if (!media.url) return media;

  // Resiliency fix: if it's a raw local key (e.g. "companies/..."), normalize to local-media proxy path
  if (media.url.startsWith("companies/")) {
    media.url = `/api/local-media/${media.url}`;
  }

  // If it's already an absolute URL (http:// or https://), leave it alone
  // EXCEPT if it points to the WRONG host (e.g. localhost:5173 when it should be localhost:4000)
  const currentOrigin = window.location.origin;
  const backendBase = API_URL.replace(/\/api\/?$/, "");

  if (media.url.startsWith("http://") || media.url.startsWith("https://")) {
    // If for some reason it points to the frontend origin, redirect it to backend
    if (media.url.startsWith(currentOrigin) && !backendBase.startsWith(currentOrigin)) {
       media.url = media.url.replace(currentOrigin, backendBase);
    }
    return media;
  }

  // If it's a relative key (like companies/...), prepend host and /
  if (media.url.startsWith("/")) {
    media.url = `${backendBase}${media.url}`;
  } else {
    media.url = `${backendBase}/${media.url}`;
  }
  
  return media;
};

/**
 * Upload a media file
 */
export const uploadMedia = async (data: UploadMediaData): Promise<Media> => {
  const formData = new FormData();
  formData.append("file", data.file);

  if (data.category) formData.append("category", data.category);
  if (data.description) formData.append("description", data.description);
  if (data.tags && data.tags.length > 0) {
    formData.append("tags", JSON.stringify(data.tags));
  }

  const response = await api.post("/media/upload", formData, {
    timeout: 60000,
  });

  return normalizeMedia(response.data as Media);
};

/**
 * Get all media files
 */
export const getMedia = async (filters?: {
  type?: string;
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<Media[]> => {
  const params = new URLSearchParams();

  if (filters?.type) params.append("type", filters.type);
  if (filters?.category) params.append("category", filters.category);
  if (filters?.search) params.append("search", filters.search);
  if (filters?.page) params.append("page", filters.page.toString());
  if (filters?.limit) params.append("limit", filters.limit.toString());

  const response = await api.get(`/media?${params.toString()}`);
  const mediaList = response.data as Media[];
  return mediaList.map(normalizeMedia);
};

/**
 * Delete a media file
 */
export const deleteMedia = async (id: string): Promise<void> => {
  await api.delete(`/media/${id}`);
};

/**
 * Update media metadata
 */
export const updateMedia = async (
  id: string,
  data: {
    originalName?: string;
    category?: string;
    description?: string;
    tags?: string[];
  },
): Promise<Media> => {
  const response = await api.patch(`/media/${id}`, data);
  return normalizeMedia(response.data as Media);
};

// === KNOWLEDGE BASE (RAG) HELPERS ===

/**
 * Upload a document for the AI Knowledge Base
 */
export const uploadKnowledgeDoc = async (file: File): Promise<Media> => {
  return uploadMedia({
    file,
    category: "KNOWLEDGE_BASE",
    tags: ["RAG", "AI_CONTEXT"],
  });
};

/**
 * Get all Knowledge Base documents
 */
export const getKnowledgeDocs = async (): Promise<Media[]> => {
  const result: Media[] = await getMedia({
    category: "KNOWLEDGE_BASE",
    type: "DOCUMENT",
  });
  return result;
};
