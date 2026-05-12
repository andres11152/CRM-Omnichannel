export interface MediaAsset {
  id: string;
  filename: string;
  originalName?: string;
  url?: string;
  fileUrl: string;
  thumbnailUrl?: string;
  type: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
  mimeType: string;
  size?: number;
  fileSize?: number;
  createdAt: string;
}
