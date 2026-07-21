import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  getMedia,
  uploadMedia,
  deleteMedia,
  updateMedia,
  Media,
} from "@/services/mediaService";
import { MediaCategory } from "../../constants/mediaCategories";
import { getModuleCache, setModuleCache } from "@/lib/moduleCache";

const MEDIA_LIBRARY_CACHE_KEY = "media:default-view";

export const useMediaLibrary = () => {
  const { t } = useTranslation();
  // Stale-while-revalidate: instant render on module/picker re-open for the
  // default (unfiltered, no search) view, silent refetch behind it.
  const cachedMedia = getModuleCache<Media[]>(MEDIA_LIBRARY_CACHE_KEY);
  const [media, setMedia] = useState<Media[]>(cachedMedia ?? []);
  const [filter, setFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(!cachedMedia);
  const [uploading, setUploading] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<Media | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [mediaToDelete, setMediaToDelete] = useState<string[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  // Rename (e.g. give a recorded voice note a specific, reusable name)
  const [renamingMedia, setRenamingMedia] = useState<Media | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  const loadMedia = useCallback(async () => {
    const isDefaultView = filter === "ALL" && !search;
    if (!(isDefaultView && getModuleCache<Media[]>(MEDIA_LIBRARY_CACHE_KEY))) {
      setLoading(true);
    }
    try {
      const data = await getMedia({
        type: filter === "ALL" ? undefined : filter,
        search: search || undefined,
      });
      setMedia(data);
      if (isDefaultView) {
        setModuleCache<Media[]>(MEDIA_LIBRARY_CACHE_KEY, data);
      }
    } catch (error: unknown) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : t("media_library.toast.load_error", "Error al cargar archivos"),
      );
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    loadMedia();
    // Reset selection when filter or search changes
    setSelectedIds(new Set());
  }, [loadMedia]);

  // DEBUG: Log media data when loaded
  useEffect(() => {
    if (media.length > 0) {
      console.info(
        "[MediaLibrary] Media loaded:",
        media.map((m) => ({
          id: m.id,
          type: m.type,
          url: m.url.substring(0, 50),
        })),
      );
    }
  }, [media]);

  const handleUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      try {
        setUploading(true);
        const newMedia = await uploadMedia({
          file,
          category: MediaCategory.MEDIA_LIBRARY, // Mark as library media
        });
        setMedia((prev) => [newMedia, ...prev]);
        toast.success(t("media_library.toast.upload_success", "Archivo subido"));
      } catch (error: unknown) {
        toast.error(
          t("media_library.toast.upload_error", "Error al subir {{filename}}: {{error}}", { filename: file.name, error: error instanceof Error ? error.message : "Error" }),
        );
      } finally {
        setUploading(false);
      }
    }
  };

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    const newSelected = new Set(selectedIds);

    if (e?.shiftKey && lastSelectedId) {
      const currentIndex = media.findIndex((m) => m.id === id);
      const lastIndex = media.findIndex((m) => m.id === lastSelectedId);

      const start = Math.min(currentIndex, lastIndex);
      const end = Math.max(currentIndex, lastIndex);

      const rangeIds = media.slice(start, end + 1).map((m) => m.id);
      rangeIds.forEach((rangeId) => newSelected.add(rangeId));
    } else {
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
    }

    setSelectedIds(newSelected);
    setLastSelectedId(id);
  };

  const selectAll = () => {
    if (selectedIds.size === media.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(media.map((m) => m.id)));
    }
  };

  const handleDelete = (ids: string | string[]) => {
    const idsArray = Array.isArray(ids) ? ids : [ids];
    setMediaToDelete(idsArray);
  };

  const confirmDelete = async () => {
    if (!mediaToDelete || mediaToDelete.length === 0) return;

    try {
      setLoading(true);
      // For now, delete one by one since backend doesn't have bulk delete
      // We use Promise.all for speed
      await Promise.all(mediaToDelete.map((id) => deleteMedia(id)));

      setMedia((prev) => prev.filter((m) => !mediaToDelete.includes(m.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        mediaToDelete.forEach((id) => next.delete(id));
        return next;
      });

      setSelectedMedia((prev) => (prev && mediaToDelete.includes(prev.id) ? null : prev));

      toast.success(
        mediaToDelete.length === 1
          ? t("media_library.toast.delete_success_one", "Archivo eliminado")
          : t("media_library.toast.delete_success_many", "{{count}} archivos eliminados", { count: mediaToDelete.length }),
      );
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : t("media_library.toast.delete_error", "Error al eliminar archivos"),
      );
    } finally {
      setMediaToDelete(null);
      setLoading(false);
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success(t("media_library.toast.url_copied", "URL copiada"));
  };

  const openRename = (item: Media) => {
    setRenamingMedia(item);
    setRenameDraft(item.originalName);
  };

  const confirmRename = async () => {
    if (!renamingMedia || !renameDraft.trim()) return;
    setIsRenaming(true);
    try {
      const updated = await updateMedia(renamingMedia.id, {
        originalName: renameDraft.trim(),
      });
      setMedia((prev) =>
        prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
      );
      setSelectedMedia((prev) =>
        prev && prev.id === updated.id ? { ...prev, ...updated } : prev,
      );
      toast.success(t("media_library.toast.renamed", "Archivo renombrado"));
      setRenamingMedia(null);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : t("media_library.toast.rename_error", "Error al renombrar"),
      );
    } finally {
      setIsRenaming(false);
    }
  };

  // Drag & Drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleUpload(files);
    }
  }, []);

  return {
    media,
    filter,
    setFilter,
    search,
    setSearch,
    loading,
    uploading,
    selectedMedia,
    setSelectedMedia,
    isDragging,
    mediaToDelete,
    setMediaToDelete,
    selectedIds,
    setSelectedIds,
    renamingMedia,
    setRenamingMedia,
    renameDraft,
    setRenameDraft,
    isRenaming,
    handleUpload,
    toggleSelect,
    selectAll,
    handleDelete,
    confirmDelete,
    copyUrl,
    openRename,
    confirmRename,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  };
};
