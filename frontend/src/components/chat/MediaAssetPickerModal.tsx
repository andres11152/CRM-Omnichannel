import React, { useState, useEffect } from "react";
import { X, Search, Image, Video, FileText, Music, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useTranslation } from "react-i18next";
import { getMedia, Media } from "@/services/mediaService";

interface MediaAssetPickerModalProps {
  onClose: () => void;
  onSelect: (media: Media) => void;
}

export const MediaAssetPickerModal: React.FC<MediaAssetPickerModalProps> = ({
  onClose,
  onSelect,
}) => {
  const { t } = useTranslation();
  const [mediaList, setMediaList] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string>("ALL");

  useEffect(() => {
    const fetchMedia = async () => {
      try {
        setLoading(true);
        // Map tab to MediaAssetType enum or fetch all
        const typeFilter = activeTab !== "ALL" ? activeTab : undefined;
        const res = await getMedia({ type: typeFilter });
        setMediaList(res);
      } catch (err) {
        console.error("Failed to fetch media assets:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMedia();
  }, [activeTab]);

  const filteredMedia = mediaList.filter((m) =>
    m.originalName.toLowerCase().includes(search.toLowerCase()) ||
    m.filename.toLowerCase().includes(search.toLowerCase())
  );

  const getIcon = (type: string) => {
    switch (type) {
      case "IMAGE":
        return <Image className="w-5 h-5 text-indigo-500" />;
      case "VIDEO":
        return <Video className="w-5 h-5 text-red-500" />;
      case "AUDIO":
        return <Music className="w-5 h-5 text-green-500" />;
      default:
        return <FileText className="w-5 h-5 text-blue-500" />;
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={t("chat.crm_library", "Biblioteca del CRM")} size="lg">
      <div className="flex flex-col h-[500px] space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            className="w-full pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-white/5 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            placeholder={t("chat.search_library", "Buscar por nombre de archivo...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Tab Filters */}
        <div className="flex border-b border-gray-100 dark:border-white/5 pb-2 overflow-x-auto gap-2">
          {["ALL", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === tab
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {tab === "ALL" ? t("chat.all_media", "Todos") : tab}
            </button>
          ))}
        </div>

        {/* Media Grid / List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          ) : filteredMedia.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-2">
              <FileText className="w-12 h-12 stroke-[1.5]" />
              <p className="text-sm">{t("chat.no_media_found", "No se encontraron archivos en la biblioteca")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-1">
              {filteredMedia.map((media) => (
                <div
                  key={media.id}
                  onClick={() => onSelect(media)}
                  className="group flex flex-col border border-gray-100 dark:border-white/5 rounded-2xl overflow-hidden hover:border-indigo-500 dark:hover:border-indigo-500 cursor-pointer transition-all bg-white dark:bg-gray-800 shadow-sm"
                >
                  {/* Preview Container */}
                  <div className="aspect-video bg-gray-50 dark:bg-gray-900/50 flex items-center justify-center relative overflow-hidden">
                    {media.type === "IMAGE" ? (
                      <img
                        src={media.url}
                        alt={media.originalName}
                        className="object-cover w-full h-full group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center space-y-1">
                        {getIcon(media.type)}
                        <span className="text-[10px] text-gray-400 font-mono uppercase">{media.mimeType.split("/")[1]}</span>
                      </div>
                    )}
                  </div>

                  {/* Info Footer */}
                  <div className="p-3 flex flex-col justify-between flex-1 space-y-1">
                    <p
                      className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate"
                      title={media.originalName}
                    >
                      {media.originalName}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                      <span>{(media.size / 1024 / 1024).toFixed(2)} MB</span>
                      <span>{new Date(media.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
