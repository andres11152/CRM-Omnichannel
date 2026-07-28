import React from "react";
import { useTranslation } from "react-i18next";
import { Pencil, FileText } from "lucide-react";
import { Media } from "@/services/mediaService";
import { formatFileSize, getFileIcon, addDefaultSrc } from "./helpers";

interface PreviewModalProps {
  media: Media;
  onClose: () => void;
  onRename: (item: Media) => void;
  onCopyUrl: (url: string) => void;
  onDelete: (id: string) => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({ media, onClose, onRename, onCopyUrl, onDelete }) => {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl bg-gray-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex justify-between items-center p-4 bg-gray-800/50 border-b border-gray-700">
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="p-2 bg-purple-600 rounded-lg">{getFileIcon(media.type)}</span>
            <div>
              <h3 className="text-white font-bold truncate max-w-md">{media.originalName}</h3>
              <p className="text-xs text-gray-400">
                {formatFileSize(media.size)} • {new Date(media.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onRename(media)}
              className="p-2 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-colors"
              title={t("media_library.card.rename", "Renombrar")}
            >
              <Pencil className="w-5 h-5" />
            </button>
            <button
              onClick={() => onCopyUrl(media.url)}
              className="p-2 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-colors"
              title={t("media_library.preview_modal.copy_url", "Copiar URL")}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Body - Player */}
        <div className="flex-1 bg-black flex items-center justify-center p-4 overflow-hidden relative group">
          {media.type === "IMAGE" ? (
            <img
              src={media.url}
              alt={media.originalName}
              className="max-w-full max-h-[70vh] object-contain shadow-2xl rounded"
              onError={addDefaultSrc}
            />
          ) : media.type === "VIDEO" ? (
            <video controls autoPlay className="max-w-full max-h-[70vh] rounded shadow-2xl w-full outline-none">
              <source src={media.url} type={media.mimeType} />
              {t("media_library.preview_modal.video_unsupported", "Tu navegador no soporta video.")}
            </video>
          ) : media.type === "AUDIO" ? (
            <div className="w-full max-w-md text-center">
              <div className="w-32 h-32 mx-auto bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mb-8 shadow-lg shadow-purple-500/50 animate-pulse-slow">
                <svg className="w-16 h-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                  />
                </svg>
              </div>
              <audio controls autoPlay className="w-full">
                <source src={media.url} type={media.mimeType} />
              </audio>
            </div>
          ) : media.mimeType === "application/pdf" ? (
            <div className="w-full h-full flex flex-col">
              <iframe
                src={`${media.url}#toolbar=0`}
                className="w-full h-[75vh] rounded-lg shadow-2xl bg-white"
                title={media.originalName}
              ></iframe>
            </div>
          ) : (
            <div className="text-center text-gray-500">
              <div className="flex justify-center mb-4">
                <FileText className="w-16 h-16 text-gray-400 dark:text-gray-600" />
              </div>
              <p>{t("media_library.preview_modal.preview_unavailable", "Vista previa no disponible para este tipo de documento.")}</p>
              <a
                href={media.url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t("media_library.preview_modal.download_open", "Descargar / Abrir")}
              </a>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-gray-800 border-t border-gray-700 flex justify-between">
          <div className="flex gap-4 text-sm text-gray-400">
            <span>
              {t("media_library.preview_modal.uploaded_by", "Subido por:")}{" "}
              <span className="text-white">{media.uploadedBy?.name || t("media_library.preview_modal.system", "Sistema")}</span>
            </span>
          </div>
          <button
            onClick={() => {
              onDelete(media.id);
              onClose();
            }}
            className="text-red-400 hover:text-red-300 text-sm font-medium flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            {t("media_library.preview_modal.delete_file", "Eliminar Archivo")}
          </button>
        </div>
      </div>
    </div>
  );
};
