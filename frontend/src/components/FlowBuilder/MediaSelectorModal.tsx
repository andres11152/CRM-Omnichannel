import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "@/services/apiConfig";
import { ImageIcon, Video, Headphones, FileText, Zap, X, Library, Mic } from "lucide-react";
import { AudioRecorder } from "../Media/AudioRecorder";
import { MediaAsset } from "@/types/media.types";

interface MediaSelectorModalProps {
  type: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
  onSelect: (asset: MediaAsset) => void;
  onClose: () => void;
}

// ==========================================
//  HELPERS (Outside component for optimization)
// ==========================================

function getTypeIcon(assetType: string) {
  const props = { size: 24, strokeWidth: 2 };
  switch (assetType) {
    case "IMAGE":
      return <ImageIcon {...props} className="text-blue-500" />;
    case "VIDEO":
      return <Video {...props} className="text-purple-500" />;
    case "AUDIO":
      return <Headphones {...props} className="text-emerald-500" />;
    case "DOCUMENT":
      return <FileText {...props} className="text-slate-500" />;
    default:
      return <Zap {...props} className="text-gray-500" />;
  }
}

function formatFileSize(bytes: number) {
  if (!bytes || isNaN(bytes)) return "0 KB";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// ==========================================
//  COMPONENT
// ==========================================

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
      // Handle both direct array and wrapped response formats
      const mediaList = Array.isArray(data)
        ? data
        : data.data?.media || data.media || [];
      
      setAssets(mediaList);
    } catch (error) {
      console.error("[MediaSelector] Error fetching media:", error);
      setAssets([]);
    } finally {
      setLoading(false);
    }
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
              className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {type === "AUDIO" && (
          <div className="px-6 pb-0 flex gap-6 border-b border-gray-200 dark:border-reply-border-dark bg-gray-50/50 dark:bg-reply-surface-dark/50">
            <button
              onClick={() => setMode("SELECT")}
              className={`py-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${
                mode === "SELECT"
                  ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                  : "border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              }`}
            >
              <Library size={16} />
              BIBLIOTECA
            </button>
            <button
              onClick={() => setMode("RECORD")}
              className={`py-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${
                mode === "RECORD"
                  ? "border-red-500 text-red-600 dark:text-red-400"
                  : "border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              }`}
            >
              <Mic size={16} />
              GRABAR VOZ
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30 dark:bg-reply-surface-dark/30">
          {mode === "RECORD" ? (
            <AudioRecorder
              onRecordingComplete={(asset) => {
                onSelect(asset);
                onClose();
              }}
              onCancel={() => setMode("SELECT")}
            />
          ) : loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent shadow-sm"></div>
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                Cargando archivos...
              </p>
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 opacity-50">
              <div className="mb-4 p-6 bg-gray-100 dark:bg-gray-800 rounded-full">
                {getTypeIcon(type)}
              </div>
              <p className="text-gray-500 dark:text-gray-400 font-bold uppercase text-xs tracking-widest">
                No hay archivos disponibles
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => setSelectedAsset(asset.id)}
                  className={`group relative cursor-pointer rounded-2xl overflow-hidden border-2 transition-all duration-300 ${
                    selectedAsset === asset.id
                      ? "border-indigo-500 ring-8 ring-indigo-500/10 shadow-2xl scale-[1.02]"
                      : "border-transparent bg-white dark:bg-reply-surface-dark hover:border-indigo-200 dark:hover:border-indigo-800 shadow-sm hover:shadow-xl"
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="aspect-square bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden relative">
                    {/* Fallback Icon (Always behind) */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-40 transition-transform duration-500 group-hover:scale-110">
                      {getTypeIcon(asset.type)}
                    </div>

                    {asset.type === "IMAGE" && (
                      <img
                        src={
                          asset.thumbnailUrl?.startsWith("http")
                            ? asset.thumbnailUrl
                            : asset.fileUrl?.startsWith("http")
                              ? asset.fileUrl
                              : asset.url?.startsWith("http")
                                ? asset.url
                                : `${API_BASE_URL}/media/${asset.id}/content`
                        }
                        alt={asset.originalName || asset.filename}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 z-10 bg-white dark:bg-reply-surface-dark"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
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

                  {/* Overlay Info */}
                  <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <p className="text-[10px] text-white font-bold truncate uppercase tracking-wider">
                      {asset.originalName || asset.filename}
                    </p>
                    <p className="text-[9px] text-gray-300 font-medium">
                      {formatFileSize(asset.fileSize || asset.size || 0)}
                    </p>
                  </div>

                  {/* Selection Checkmark */}
                  {selectedAsset === asset.id && (
                    <div className="absolute top-3 right-3 bg-indigo-500 text-white p-1.5 rounded-full shadow-lg animate-bounce">
                      <Zap size={14} fill="currentColor" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-reply-border-dark flex justify-end gap-4 bg-gray-50/50 dark:bg-reply-surface-dark/50">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl text-sm font-black text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all uppercase tracking-widest"
          >
            Cancelar
          </button>
          <button
            onClick={handleSelect}
            disabled={!selectedAsset}
            className={`px-8 py-2.5 rounded-xl text-sm font-black transition-all shadow-xl uppercase tracking-widest ${
              selectedAsset
                ? "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95"
                : "bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed shadow-none"
            }`}
          >
            Seleccionar
          </button>
        </div>
      </div>
    </div>
  );
};
