import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Star, Trash2, UploadCloud, Loader2, GripVertical } from "lucide-react";
import type { PropertyImage } from "@/types/property.types";
import {
  uploadPropertyImages,
  deletePropertyImage,
  setPropertyCover,
  reorderPropertyImages,
} from "@/services/propertyService";

interface Props {
  propertyId: string;
  images: PropertyImage[];
  onChange: (images: PropertyImage[]) => void;
}

/**
 * [REAL ESTATE] Galería de fotos del inmueble.
 * Sube a S3 (vía backend), marca portada, reordena (drag) y elimina.
 */
export const PropertyGalleryUploader: React.FC<Props> = ({
  propertyId,
  images,
  onChange,
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) {
      toast.error(t("properties_gallery.invalid_files", "Selecciona archivos de imagen válidos"));
      return;
    }
    setUploading(true);
    try {
      const created = await uploadPropertyImages(propertyId, arr);
      onChange([...images, ...created]);
      toast.success(t("properties_gallery.upload_success", "{{count}} imagen(es) subida(s)", { count: created.length }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("properties_gallery.upload_error", "Error al subir imágenes"));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async (imageId: string) => {
    const prev = images;
    onChange(images.filter((i) => i.id !== imageId)); // optimista
    try {
      await deletePropertyImage(propertyId, imageId);
    } catch (err) {
      onChange(prev);
      toast.error(err instanceof Error ? err.message : t("properties_gallery.delete_error", "No se pudo eliminar"));
    }
  };

  const handleCover = async (imageId: string) => {
    try {
      const updated = await setPropertyCover(propertyId, imageId);
      onChange(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("properties_gallery.cover_error", "No se pudo fijar portada"));
    }
  };

  const handleDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = images.map((i) => i.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    const reordered = ids.map((id) => images.find((i) => i.id === id)!);
    onChange(reordered); // optimista
    setDragId(null);
    try {
      const persisted = await reorderPropertyImages(propertyId, ids);
      onChange(persisted);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("properties_gallery.reorder_error", "No se pudo reordenar"));
    }
  };

  return (
    <div className="space-y-3">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center cursor-pointer hover:border-reply-brand hover:bg-reply-brand/5 transition-colors"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2 text-reply-brand">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-sm font-medium">{t("properties_gallery.uploading", "Subiendo imágenes…")}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-500 dark:text-gray-400">
            <UploadCloud className="w-8 h-8" />
            <span className="text-sm font-medium">
              {t("properties_gallery.drop_hint", "Arrastra fotos aquí o haz clic para subir")}
            </span>
            <span className="text-xs">{t("properties_gallery.file_types_hint", "JPG, PNG o WebP · hasta 10MB c/u")}</span>
          </div>
        )}
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {images.map((img) => (
            <div
              key={img.id}
              draggable
              onDragStart={() => setDragId(img.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(img.id)}
              className={`relative group aspect-square rounded-lg overflow-hidden border ${
                img.isCover
                  ? "border-reply-brand ring-2 ring-reply-brand"
                  : "border-gray-200 dark:border-gray-700"
              }`}
            >
              <img
                src={img.url}
                alt={t("properties_gallery.photo_alt", "Foto inmueble")}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {img.isCover && (
                <span className="absolute top-1 left-1 bg-reply-brand text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                  {t("properties_gallery.cover_badge", "Portada")}
                </span>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  type="button"
                  title={t("properties_gallery.set_cover_title", "Fijar como portada")}
                  onClick={() => handleCover(img.id)}
                  className="p-1.5 bg-white/90 rounded-full hover:bg-white text-amber-500"
                >
                  <Star className="w-4 h-4" fill={img.isCover ? "currentColor" : "none"} />
                </button>
                <button
                  type="button"
                  title={t("properties_gallery.delete_title", "Eliminar")}
                  onClick={() => handleDelete(img.id)}
                  className="p-1.5 bg-white/90 rounded-full hover:bg-white text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <span className="absolute bottom-1 right-1 text-white/70">
                  <GripVertical className="w-4 h-4" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
