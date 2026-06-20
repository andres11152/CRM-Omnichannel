import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  getMedia,
  uploadMedia,
  deleteMedia,
  Media,
} from "@/services/mediaService";
import { ModuleHeader } from "./common/ModuleHeader";
import { MediaCategory } from "../constants/mediaCategories";

interface MediaLibraryProps {
  onSelect?: (media: Media) => void;
  onClose?: () => void;
}

export const MediaLibrary: React.FC<MediaLibraryProps> = ({
  onSelect,
  onClose,
}) => {
  const [media, setMedia] = useState<Media[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<Media | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [mediaToDelete, setMediaToDelete] = useState<string[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  useEffect(() => {
    loadMedia();
    // Reset selection when filter or search changes
    setSelectedIds(new Set());
  }, [filter, search]);

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

  const loadMedia = async () => {
    try {
      setLoading(true);
      const data = await getMedia({
        type: filter === "ALL" ? undefined : filter,
        search: search || undefined,
      });
      setMedia(data);
    } catch (error: unknown) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Error al cargar archivos",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      try {
        setUploading(true);
        const newMedia = await uploadMedia({
          file,
          category: MediaCategory.MEDIA_LIBRARY, // Mark as library media
        });
        setMedia([newMedia, ...media]);
        toast.success("Archivo subido");
      } catch (error: unknown) {
        toast.error(
          `Error al subir ${file.name}: ${error instanceof Error ? error.message : "Error"}`,
        );
      } finally {
        setUploading(false);
      }
    }
  };

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    const newSelected = new Set(selectedIds);
    
    if (e?.shiftKey && lastSelectedId) {
      const currentIndex = media.findIndex(m => m.id === id);
      const lastIndex = media.findIndex(m => m.id === lastSelectedId);
      
      const start = Math.min(currentIndex, lastIndex);
      const end = Math.max(currentIndex, lastIndex);
      
      const rangeIds = media.slice(start, end + 1).map(m => m.id);
      rangeIds.forEach(rangeId => newSelected.add(rangeId));
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
      setSelectedIds(new Set(media.map(m => m.id)));
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
      await Promise.all(mediaToDelete.map(id => deleteMedia(id)));
      
      setMedia(media.filter((m) => !mediaToDelete.includes(m.id)));
      setSelectedIds(prev => {
        const next = new Set(prev);
        mediaToDelete.forEach(id => next.delete(id));
        return next;
      });
      
      if (selectedMedia && mediaToDelete.includes(selectedMedia.id)) {
        setSelectedMedia(null);
      }
      
      toast.success(
        mediaToDelete.length === 1
          ? "Archivo eliminado"
          : `${mediaToDelete.length} archivos eliminados`
      );
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Error al eliminar archivos",
      );
    } finally {
      setMediaToDelete(null);
      setLoading(false);
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copiada");
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

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleUpload(files);
      }
    },
    [media],
  );

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case "IMAGE":
        return "🖼️";
      case "AUDIO":
        return "🎵";
      case "VIDEO":
        return "🎥";
      case "DOCUMENT":
        return "📄";
      default:
        return "📁";
    }
  };

  // Helper for broken images - with debug logging
  const addDefaultSrc = (ev: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const originalSrc = ev.currentTarget.src;
    console.error("[MediaLibrary] Image failed to load:", originalSrc);
    ev.currentTarget.src =
      "https://ui-avatars.com/api/?name=Error&background=ef4444&color=fff";
  };

  // Helper to get file extension from URL or mimeType
  const getFileExtension = (item: Media): string => {
    // For proxy URLs, use mimeType to determine extension
    if (item.url.includes("/content")) {
      const mimeMap: Record<string, string> = {
        "image/jpeg": "JPG",
        "image/jpg": "JPG",
        "image/png": "PNG",
        "image/gif": "GIF",
        "image/webp": "WEBP",
        "audio/ogg": "OGG",
        "audio/mpeg": "MP3",
        "audio/wav": "WAV",
        "video/mp4": "MP4",
        "video/webm": "WEBM",
        "application/pdf": "PDF",
      };
      return (
        mimeMap[item.mimeType] ||
        item.mimeType.split("/")[1]?.toUpperCase() ||
        "FILE"
      );
    }
    // For direct URLs, extract from filename
    return item.originalName.split(".").pop()?.toUpperCase() || "FILE";
  };

  return (
    <div
      className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark font-sans"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      {onClose ? (
        <div className="bg-white dark:bg-reply-panel-dark px-6 py-4 border-b border-gray-200 dark:border-reply-border-dark flex justify-between items-center shadow-sm z-10">
          <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <span className="text-2xl">[DIR]</span> Seleccionar Archivo
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <svg
              className="w-6 h-6 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      ) : (
        <ModuleHeader
          title="Biblioteca Multimedia"
          description="Gestiona y visualiza todos tus activos digitales"
          icon={
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          }
          gradient="from-indigo-600 to-purple-600 dark:from-indigo-800 dark:to-purple-800"
          stats={{ label: "Total Archivos", value: media.length }}
        />
      )}

      {/* Toolbar */}
      <div className="px-6 py-4 bg-white dark:bg-reply-panel-dark border-b border-gray-200 dark:border-reply-border-dark flex flex-col md:flex-row gap-4 justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl overflow-x-auto max-w-full no-scrollbar">
          {["ALL", "IMAGE", "AUDIO", "VIDEO", "DOCUMENT"].map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-2 ${
                filter === type
                  ? "bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {type === "ALL"
                ? "Todos"
                : type.charAt(0) + type.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="flex w-full md:w-auto gap-3">
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-reply-bg dark:bg-gray-800 border-none rounded-xl text-gray-800 dark:text-white focus:ring-2 focus:ring-purple-500/50"
            />
            <svg
              className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>

          <label className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium cursor-pointer transition-colors shadow-lg shadow-purple-500/30">
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            <span className="hidden sm:inline">Subir</span>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleUpload(e.target.files)}
            />
          </label>
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 animate-pulse">
            <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full mb-4"></div>
            <p>Cargando biblioteca...</p>
          </div>
        ) : media.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-300 dark:border-reply-border-dark rounded-3xl m-4 bg-reply-bg/50 dark:bg-gray-800/30">
            <div className="p-8 bg-white dark:bg-gray-800 rounded-full shadow-sm mb-4">
              <svg
                className="w-16 h-16 text-purple-200"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <p className="text-xl font-medium text-gray-600 dark:text-gray-300">
              Tu biblioteca está vacía
            </p>
            <p className="text-sm mt-2">
              Arrastra archivos aquíí o usa el botón de subir
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {media.map((item) => {
              const isSelected = selectedIds.has(item.id);
              return (
                <div
                  key={item.id}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey || e.shiftKey || selectedIds.size > 0) {
                      toggleSelect(item.id, e);
                    } else if (onSelect) {
                      onSelect(item);
                    } else {
                      setSelectedMedia(item);
                    }
                  }}
                  className={`group relative bg-white dark:bg-gray-800 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden ring-1 ${
                    isSelected
                      ? "ring-2 ring-purple-500 bg-purple-50 dark:bg-purple-900/10 -translate-y-1"
                      : "ring-gray-100 dark:ring-gray-700 hover:ring-purple-500/50 hover:-translate-y-1"
                  }`}
                >
                  {/* Selection Checkbox (Top Left) */}
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(item.id);
                    }}
                    className={`absolute top-3 left-3 z-20 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                      isSelected 
                        ? "bg-purple-600 border-purple-600 text-white scale-110 shadow-lg shadow-purple-500/40" 
                        : "bg-white/10 backdrop-blur-md border-white/40 opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {isSelected && (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>

                  {/* Media Preview Aspect Ratio 1:1 */}
                  <div className="aspect-square relative bg-gray-100 dark:bg-gray-900 overflow-hidden">
                    {item.type === "IMAGE" ? (
                      <img
                        src={item.url}
                        onError={addDefaultSrc}
                        alt={item.originalName}
                        className={`w-full h-full object-cover transition-all duration-500 ${
                          isSelected ? "scale-95 opacity-80" : "group-hover:scale-105"
                        }`}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 group-hover:text-purple-500 transition-colors">
                        {item.type === "VIDEO" ? (
                          <svg
                            className="w-12 h-12"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        ) : item.type === "AUDIO" ? (
                          <svg
                            className="w-12 h-12"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                            />
                          </svg>
                        ) : (
                          <span className="text-4xl">📄</span>
                        )}
                        <span className="text-xs font-bold mt-2 uppercase tracking-wide opacity-50">
                          {item.type}
                        </span>
                      </div>
                    )}

                    {/* Hover Overlay with Quick Actions */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px]">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyUrl(item.url);
                        }}
                        className="p-2 bg-white/20 hover:bg-white text-white hover:text-purple-600 rounded-full backdrop-blur-md transition-all transform hover:scale-110"
                        title="Copiar Link"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.id);
                        }}
                        className="p-2 bg-red-500/80 hover:bg-red-600 text-white rounded-full backdrop-blur-md transition-all transform hover:scale-110"
                        title="Eliminar"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="p-3">
                    <h3
                      className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate"
                      title={item.originalName}
                    >
                      {item.originalName}
                    </h3>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs text-gray-400">
                        {formatFileSize(item.size)}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded uppercase">
                        {getFileExtension(item)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[40] animate-in slide-in-from-bottom-10 fade-in duration-300">
          <div className="bg-gray-900/90 backdrop-blur-xl border border-gray-700 rounded-2xl px-6 py-4 shadow-2xl flex items-center gap-6">
            <div className="flex items-center gap-3 border-r border-gray-700 pr-6">
              <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-sm">
                {selectedIds.size}
              </div>
              <span className="text-white font-medium text-sm">Archivos seleccionados</span>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={selectAll}
                className="px-4 py-2 text-sm font-semibold text-gray-300 hover:text-white hover:bg-white/10 rounded-xl transition-all"
              >
                {selectedIds.size === media.length ? "Desmarcar todos" : "Seleccionar todos"}
              </button>
              
              <button
                onClick={() => handleDelete(Array.from(selectedIds))}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-red-500/40 transition-all hover:scale-105"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Eliminar seleccionados
              </button>
              
              <button
                onClick={() => setSelectedIds(new Set())}
                className="p-2 text-gray-400 hover:text-white rounded-lg"
                title="Cancelar selección"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drag Overlay */}
      {isDragging && (
        <div className="fixed inset-0 bg-purple-600/90 backdrop-blur-md z-50 flex items-center justify-center pointer-events-none animate-fade-in">
          <div className="text-center text-white p-10 border-4 border-white/30 rounded-3xl border-dashed">
            <svg
              className="w-24 h-24 mx-auto mb-4 animate-bounce"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <h2 className="text-3xl font-bold">Suelta tus archivos aquíí</h2>
            <p className="text-lg opacity-80 mt-2">
              Se subirn instantneamente a tu nube
            </p>
          </div>
        </div>
      )}

      {/* Full Screen Preview Modal */}
      {selectedMedia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-fade-in"
          onClick={() => setSelectedMedia(null)}
        >
          <div
            className="relative w-full max-w-5xl bg-gray-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center p-4 bg-gray-800/50 border-b border-gray-700">
              <div className="flex items-center gap-3 overflow-hidden">
                <span className="p-2 bg-purple-600 rounded-lg">
                  {getFileIcon(selectedMedia.type)}
                </span>
                <div>
                  <h3 className="text-white font-bold truncate max-w-md">
                    {selectedMedia.originalName}
                  </h3>
                  <p className="text-xs text-gray-400">
                    {formatFileSize(selectedMedia.size)} •{" "}
                    {new Date(selectedMedia.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyUrl(selectedMedia.url)}
                  className="p-2 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-colors"
                  title="Copiar URL"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => setSelectedMedia(null)}
                  className="p-2 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-colors"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body - Player */}
            <div className="flex-1 bg-black flex items-center justify-center p-4 overflow-hidden relative group">
              {selectedMedia.type === "IMAGE" ? (
                <img
                  src={selectedMedia.url}
                  alt={selectedMedia.originalName}
                  className="max-w-full max-h-[70vh] object-contain shadow-2xl rounded"
                  onError={addDefaultSrc}
                />
              ) : selectedMedia.type === "VIDEO" ? (
                <video
                  controls
                  autoPlay
                  className="max-w-full max-h-[70vh] rounded shadow-2xl w-full outline-none"
                >
                  <source
                    src={selectedMedia.url}
                    type={selectedMedia.mimeType}
                  />
                  Tu navegador no soporta video.
                </video>
              ) : selectedMedia.type === "AUDIO" ? (
                <div className="w-full max-w-md text-center">
                  <div className="w-32 h-32 mx-auto bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mb-8 shadow-lg shadow-purple-500/50 animate-pulse-slow">
                    <svg
                      className="w-16 h-16 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                      />
                    </svg>
                  </div>
                  <audio controls autoPlay className="w-full">
                    <source
                      src={selectedMedia.url}
                      type={selectedMedia.mimeType}
                    />
                  </audio>
                </div>
              ) : selectedMedia.mimeType === "application/pdf" ? (
                <div className="w-full h-full flex flex-col">
                  <iframe
                    src={`${selectedMedia.url}#toolbar=0`}
                    className="w-full h-[75vh] rounded-lg shadow-2xl bg-white"
                    title={selectedMedia.originalName}
                  ></iframe>
                </div>
              ) : (
                <div className="text-center text-gray-500">
                  <div className="text-6xl mb-4">📄</div>
                  <p>Vista previa no disponible para este tipo de documento.</p>
                  <a
                    href={selectedMedia.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Descargar / Abrir
                  </a>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-800 border-t border-gray-700 flex justify-between">
              <div className="flex gap-4 text-sm text-gray-400">
                <span>
                  Subido por:{" "}
                  <span className="text-white">
                    {selectedMedia.uploadedBy?.name || "Sistema"}
                  </span>
                </span>
              </div>
              <button
                onClick={() => {
                  handleDelete(selectedMedia.id);
                  setSelectedMedia(null);
                }}
                className="text-red-400 hover:text-red-300 text-sm font-medium flex items-center gap-1"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Eliminar Archivo
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {mediaToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-reply-panel-dark rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 dark:border-reply-border-dark overflow-hidden transform transition-all scale-100">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-red-600 dark:text-red-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                {mediaToDelete.length === 1 
                  ? "¿Eliminar archivo permanentemente?" 
                  : `¿Eliminar ${mediaToDelete.length} archivos permanentemente?`}
              </h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
                Esta acción no se puede deshacer. {mediaToDelete.length === 1 
                  ? "El archivo desaparecerá" 
                  : "Los archivos desaparecerán"} de tu biblioteca y de cualquier chat donde se hayan compartido.
              </p>

              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setMediaToDelete(null)}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-reply-border-dark text-gray-700 dark:text-gray-300 font-medium hover:bg-reply-bg dark:hover:bg-gray-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-lg shadow-red-500/30 transition-all hover:scale-105 active:scale-95"
                >
                  Sí, Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
