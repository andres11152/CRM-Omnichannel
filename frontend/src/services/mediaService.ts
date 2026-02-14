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
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data.data.media;
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
}): Promise<{
  media: Media[];
  total: number;
  page: number;
  totalPages: number;
}> => {
  const params = new URLSearchParams();

  if (filters?.type) params.append("type", filters.type);
  if (filters?.category) params.append("category", filters.category);
  if (filters?.search) params.append("search", filters.search);
  if (filters?.page) params.append("page", filters.page.toString());
  if (filters?.limit) params.append("limit", filters.limit.toString());

  const response = await api.get(`/media?${params.toString()}`);
  return response.data.data;
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
    category?: string;
    description?: string;
    tags?: string[];
  },
): Promise<Media> => {
  const response = await api.patch(`/media/${id}`, data);
  return response.data.data.media;
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
  const result = await getMedia({
    category: "KNOWLEDGE_BASE",
    type: "DOCUMENT",
  });
  return result.media;
};

