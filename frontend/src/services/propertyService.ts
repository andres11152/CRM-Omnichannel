import axios from "axios";
import { api } from "@/lib/axios";
import type {
  Property,
  PropertyFilters,
  PropertyListResponse,
  PropertyCatalog,
  PropertyImage,
  CreatePropertyPayload,
} from "@/types/property.types";

/**
 * [REAL ESTATE] Cliente del módulo inmobiliario.
 */

const buildQuery = (filters: PropertyFilters = {}): string => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.append(key, String(value));
    }
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

export const getProperties = async (
  filters: PropertyFilters = {},
): Promise<PropertyListResponse> => {
  const res = await api.get(`/properties${buildQuery(filters)}`);
  // El backend responde { status, items, total, page, limit, totalPages }
  return {
    items: res.data.items ?? [],
    total: res.data.total ?? 0,
    page: res.data.page ?? 1,
    limit: res.data.limit ?? 20,
    totalPages: res.data.totalPages ?? 1,
  };
};

export const getProperty = async (id: string): Promise<Property> => {
  const res = await api.get(`/properties/${id}`);
  return res.data.data;
};

export const getPropertyCatalog = async (): Promise<PropertyCatalog> => {
  const res = await api.get(`/properties/catalog`);
  return res.data.data;
};

export const createProperty = async (
  payload: CreatePropertyPayload,
): Promise<Property> => {
  const res = await api.post(`/properties`, payload);
  return res.data.data;
};

export const updateProperty = async (
  id: string,
  payload: Partial<CreatePropertyPayload>,
): Promise<Property> => {
  const res = await api.put(`/properties/${id}`, payload);
  return res.data.data;
};

export const deleteProperty = async (id: string): Promise<void> => {
  await api.delete(`/properties/${id}`);
};

export const publishProperty = async (
  id: string,
  isPublished: boolean,
): Promise<Property> => {
  const res = await api.patch(`/properties/${id}/publish`, { isPublished });
  return res.data.data;
};

// ── Galería ──────────────────────────────────────────────
export const uploadPropertyImages = async (
  id: string,
  files: File[],
): Promise<PropertyImage[]> => {
  const formData = new FormData();
  files.forEach((file) => formData.append("images", file));
  const res = await api.post(`/properties/${id}/images`, formData, {
    timeout: 60000, // subida de varias imágenes puede tardar
  });
  return res.data.data;
};

export const deletePropertyImage = async (
  id: string,
  imageId: string,
): Promise<void> => {
  await api.delete(`/properties/${id}/images/${imageId}`);
};

export const reorderPropertyImages = async (
  id: string,
  orderedIds: string[],
): Promise<PropertyImage[]> => {
  const res = await api.patch(`/properties/${id}/images/reorder`, { orderedIds });
  return res.data.data;
};

export const setPropertyCover = async (
  id: string,
  imageId: string,
): Promise<PropertyImage[]> => {
  const res = await api.patch(`/properties/${id}/images/cover`, { imageId });
  return res.data.data;
};

// ── Ficha pública (sin auth) ─────────────────────────────
export const getPublicProperty = async (publicId: string): Promise<Property> => {
  const base = (import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace(
    /\/api\/?$/,
    "",
  );
  const res = await axios.get(`${base}/public/properties/${publicId}`);
  return res.data.data;
};
