import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "@/services/apiConfig";

import { AudioRecorder } from "../Media/AudioRecorder";

interface MediaAsset {
  id: string;
  filename: string;
  url?: string; // From backend (old format)
  fileUrl: string; // From backend (new format)
  thumbnailUrl?: string;
  type: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
  mimeType: string;
  size?: number; // From backend (size field)
  fileSize: number; // Alternative field
  createdAt: string;
}

interface MediaSelectorModalProps {
  type: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
  onSelect: (asset: MediaAsset) => void;
  onClose: () => void;
}

export const MediaSelectorModal: React.FC<MediaSelectorModalProps> = ({
  type,
  onSelect,
  onClose,
}) => {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [mode, setMode] = useState<"SELECT" | "RECORD">("SELECT");

  useEffect(() => {
    fetchAssets();
  }, [type]);

  async function fetchAssets() {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${API_BASE_URL}/media?type=${type}&limit=50`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.ok) throw new Error("Failed to fetch media");

      const data = await response.json();
      setAssets(data.data?.media || data.media || []);
    } catch (error) {
      console.error("[MediaSelector] Error fetching media:", error);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }

  function getTypeIcon(assetType: string) {
    switch (assetType) {
      case "IMAGE":
        return "️";
      case "VIDEO":
        return "";
      case "AUDIO":
        return "";
      case "DOCUMENT":
        return "";
      default:
        return "[PKG]";
    }
  }

  function formatFileSize(bytes: number) {
    if (!bytes || isNaN(bytes)) return "0 KB";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function handleSelect() {
    const asset = assets.find((a) => a.id === selectedAsset);
    if (asset) {
      onSelect(asset);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[99999] p-4 animate-fadeIn">
      <div className="bg-white dark:bg-reply-panel-dark rounded-xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-slideUp">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-reply-border-dark bg-gradient-to-r from-gray-50 to-white dark:from-[#111b21] dark:to-[#202c33]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {getTypeIcon(type)} Seleccionar{" "}
                {type === "IMAGE"
                  ? "Imagen"
                  : type === "VIDEO"
                    ? "Video"
                    : type === "AUDIO"
                      ? "Audio"
                      : "Documento"}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Haz click en un archivo para seleccionarlo
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
            >
              <svg
                className="w-6 h-6"
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
        </div>

        {type === "AUDIO" && (
          <div className="px-6 pb-0 flex gap-4 border-b border-gray-200 dark:border-reply-border-dark">
            <button
              onClick={() => setMode("SELECT")}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                mode === "SELECT"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
              }`}
            >
               Biblioteca
            </button>
            <button
              onClick={() => setMode("RECORD")}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                mode === "RECORD"
                  ? "border-red-500 text-red-600 dark:text-red-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
              }`}
            >
              ️ Grabar Voz
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {mode === "RECORD" ? (
            // @ts-ignore
            <AudioRecorder
              onRecordingComplete={(asset) => {
                onSelect(asset as unknown as MediaAsset);
                onClose();
              }}
              onCancel={() => setMode("SELECT")}
            />
          ) : loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
              <p className="ml-4 text-gray-600 dark:text-gray-400">
                Cargando archivos...
              </p>
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="text-6xl mb-4 opacity-50">
                {getTypeIcon(type)}
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-center">
                No hay archivos de este tipo aún
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                Sube archivos desde la sección "Multimedia"
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => setSelectedAsset(asset.id)}
                  className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                    selectedAsset === asset.id
                      ? "border-blue-500 ring-4 ring-blue-500/20 shadow-lg scale-105"
                      : "border-gray-200 dark:border-reply-border-dark hover:border-blue-300 dark:hover:border-blue-600"
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center overflow-hidden">
                    {asset.type === "IMAGE" &&
                    (asset.thumbnailUrl || asset.fileUrl || asset.url) ? (
                      <img
                        src={
                          asset.thumbnailUrl ||
                          asset.fileUrl ||
                          (asset as unknown as { url: string }).url
                        }
                        alt={asset.filename}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          e.currentTarget.parentElement!.innerHTML = `<div class="text-4xl opacity-50">${getTypeIcon(asset.type)}</div>`;
                        }}
                      />
                    ) : (
                      <div className="text-4xl opacity-50">
                        {getTypeIcon(asset.type)}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3 bg-white dark:bg-reply-surface-dark">
                    <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                      {asset.filename}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {formatFileSize(asset.size || asset.fileSize || 0)}
                    </p>
                  </div>

                  {/* Selected check */}
                  {selectedAsset === asset.id && (
                    <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1 shadow-lg">
                      <svg
                        className="w-4 h-4 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-reply-border-dark flex justify-end items-center bg-reply-bg dark:bg-reply-surface-dark gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={handleSelect}
            disabled={!selectedAsset}
            className={`px-6 py-2 rounded-lg font-medium transition shadow-md ${
              selectedAsset
                ? "bg-blue-500 hover:bg-blue-600 text-white hover:shadow-lg"
                : "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed opacity-50"
            }`}
          >
            Seleccionar
          </button>
        </div>
      </div>
    </div>
  );
};
