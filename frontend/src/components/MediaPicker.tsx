import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { Image as ImageIcon } from "lucide-react";
import { getMedia, Media } from "@/services/mediaService";
import { Modal, ModalButton } from "@/components/ui/Modal";

interface MediaPickerProps {
  onSelect: (media: Media) => void;
  onClose: () => void;
  allowedTypes?: ("IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT")[];
  title?: string;
}

export const MediaPicker: React.FC<MediaPickerProps> = ({
  onSelect,
  onClose,
  allowedTypes,
  title = "Seleccionar Archivo",
}) => {
  const [media, setMedia] = useState<Media[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMedia();
  }, [filter]);

  const loadMedia = async () => {
    try {
      setLoading(true);
      const data = await getMedia({
        type: filter === "ALL" ? undefined : filter,
      });

      // Filter by allowed types if specified
      let filteredMedia = data;
      if (allowedTypes && allowedTypes.length > 0) {
        filteredMedia = data.filter((m: Media) => allowedTypes.includes(m.type));
      }

      setMedia(filteredMedia);
    } catch (error: unknown) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Error al cargar archivos",
      );
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case "IMAGE":
        return "️";
      case "AUDIO":
        return "";
      case "VIDEO":
        return "";
      case "DOCUMENT":
        return "";
      default:
        return "";
    }
  };

  // Available filters based on allowed types
  const availableFilters =
    allowedTypes && allowedTypes.length > 0
      ? ["ALL", ...allowedTypes]
      : ["ALL", "IMAGE", "AUDIO", "VIDEO", "DOCUMENT"];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      icon={<ImageIcon className="w-5 h-5" />}
      size="xl"
      footer={
        <ModalButton variant="secondary" onClick={onClose}>
          Cancelar
        </ModalButton>
      }
    >
      <div className="-mx-6 -my-5">
        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-reply-border-dark">
          <div className="flex items-center gap-2 flex-wrap">
            {availableFilters.map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  filter === type
                    ? "bg-indigo-600 text-white shadow-md"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                {type === "ALL" ? " Todos" : `${getFileIcon(type)} ${type}`}
              </button>
            ))}
          </div>
        </div>

        {/* Media Grid */}
        <div className="flex-1 p-6 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          ) : media.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <svg
                className="w-20 h-20 mb-4 opacity-20"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                />
              </svg>
              <p className="text-lg font-semibold">No hay archivos</p>
              <p className="text-sm mt-1">
                Sube archivos desde la Biblioteca Multimedia
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {media.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelect(item)}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-all group overflow-hidden border-2 border-transparent hover:border-indigo-500 focus:border-indigo-500 focus:outline-none"
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-square overflow-hidden bg-gray-100 dark:bg-gray-700">
                    {item.type === "IMAGE" ? (
                      <img
                        src={item.url}
                        alt={item.originalName}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-4xl">
                          {getFileIcon(item.type)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-2">
                    <p
                      className="text-xs font-semibold text-gray-800 dark:text-white truncate"
                      title={item.originalName}
                    >
                      {item.originalName}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      {formatFileSize(item.size)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
