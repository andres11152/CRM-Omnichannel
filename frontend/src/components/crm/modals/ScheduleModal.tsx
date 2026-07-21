import React, { useState, useRef } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Info, Send, Calendar, Clock, Paperclip, FolderOpen, Mic, Trash2, FileText, Image, Video, Music } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { VoiceRecorderModal } from "../../chat/VoiceRecorderModal";
import { MediaAssetPickerModal } from "../../chat/MediaAssetPickerModal";
import { Media } from "@/services/mediaService";

export interface AttachmentPayload {
  url: string;
  type: "image" | "video" | "audio" | "document";
  name: string;
  mimetype: string;
  ptt?: boolean;
  [key: string]: unknown;
}

export interface ScheduleModalProps {
  onClose: () => void;
  onConfirm: (
    date: Date,
    message: string,
    mediaFile?: File | null,
    directAttachment?: AttachmentPayload | null
  ) => void;
}

export const ScheduleModal: React.FC<ScheduleModalProps> = ({ onClose, onConfirm }) => {
  const { t } = useTranslation();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [message, setMessage] = useState("");
  
  // Attachments State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [libraryAsset, setLibraryAsset] = useState<Media | null>(null);
  
  // Modals Visibility
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleConfirm = () => {
    if (!date || !time) return toast.error(t("actions.err_date_time", "Selecciona fecha y hora"));
    if (!message.trim() && !selectedFile && !libraryAsset) {
      return toast.error(t("actions.err_msg_or_media", "Escribe un mensaje o adjunta un archivo"));
    }

    const scheduledDate = new Date(`${date}T${time}`);
    if (scheduledDate < new Date()) {
      return toast.error(t("actions.err_future", "La fecha debe ser futura"));
    }

    // Prepare direct attachment structure if using CRM Library
    const directAttachment: AttachmentPayload | null = libraryAsset ? {
      url: libraryAsset.url,
      type: libraryAsset.type.toLowerCase() as "image" | "video" | "audio" | "document",
      name: libraryAsset.originalName,
      mimetype: libraryAsset.mimeType,
    } : null;

    onConfirm(scheduledDate, message, selectedFile, directAttachment);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setLibraryAsset(null); // Clear library selection
    }
  };

  const handleLibrarySelect = (media: Media) => {
    setLibraryAsset(media);
    setSelectedFile(null); // Clear local file selection
    setShowLibraryPicker(false);
  };

  const handleVoiceNoteConfirm = (file: File) => {
    setSelectedFile(file);
    setLibraryAsset(null);
    setShowVoiceRecorder(false);
  };

  const clearAttachment = () => {
    setSelectedFile(null);
    setLibraryAsset(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const getAttachmentIcon = () => {
    if (libraryAsset) {
      switch (libraryAsset.type) {
        case "IMAGE": return <Image className="w-5 h-5 text-indigo-500" />;
        case "VIDEO": return <Video className="w-5 h-5 text-red-500" />;
        case "AUDIO": return <Music className="w-5 h-5 text-green-500" />;
        default: return <FileText className="w-5 h-5 text-blue-500" />;
      }
    }
    
    if (selectedFile) {
      const type = selectedFile.type.toLowerCase();
      if (type.startsWith("image/")) return <Image className="w-5 h-5 text-indigo-500" />;
      if (type.startsWith("video/")) return <Video className="w-5 h-5 text-red-500" />;
      if (type.startsWith("audio/")) return <Music className="w-5 h-5 text-green-500" />;
      return <FileText className="w-5 h-5 text-blue-500" />;
    }
    
    return null;
  };

  const getAttachmentName = (): string => {
    if (libraryAsset) return libraryAsset.originalName;
    if (selectedFile) return selectedFile.name;
    return "";
  };

  return (
    <>
      <Modal isOpen onClose={onClose} title={t("actions.schedule_title", "Programación Enterprise")} size="md">
        <div className="space-y-5">
          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl flex items-start gap-3 border border-indigo-100 dark:border-indigo-500/20">
            <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5" />
            <p className="text-[12px] text-indigo-800 dark:text-indigo-200 font-medium">
              {t("actions.schedule_desc", "El sistema procesará y enviará este mensaje automáticamente a través de la API oficial de WhatsApp en el momento exacto programado.")}
            </p>
          </div>

          {/* Message Content */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase ml-1">
              <Send className="w-3.5 h-3.5" />
              {t("actions.message_content", "Contenido del Mensaje")}
            </div>
            <textarea
              className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-white/5 focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-28 text-sm transition-all shadow-inner"
              placeholder={t("actions.message_placeholder", "Escribe aquí el mensaje que deseas programar...")}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              autoFocus
            />
          </div>

          {/* Attachment Section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase ml-1">
              <Paperclip className="w-3.5 h-3.5" />
              {t("chat.attachments", "Archivo Adjunto (Opcional)")}
            </div>

            {/* Selected Attachment Preview */}
            {(selectedFile || libraryAsset) ? (
              <div className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-white/5 shadow-sm">
                <div className="flex items-center space-x-3 truncate">
                  {getAttachmentIcon()}
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">
                    {getAttachmentName()}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {libraryAsset ? t("chat.crm_library", "Biblioteca CRM") : t("chat.local_pc", "Desde PC")}
                  </span>
                </div>
                <button
                  onClick={clearAttachment}
                  className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              /* Attachment Options */
              <div className="grid grid-cols-3 gap-3">
                {/* Local Upload */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center py-3 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700/80 rounded-xl border border-gray-200 dark:border-white/5 text-gray-600 dark:text-gray-300 transition-all hover:border-indigo-500"
                >
                  <Paperclip className="w-4.5 h-4.5 text-indigo-500 mb-1" />
                  <span className="text-[10px] font-bold">{t("chat.from_pc", "Desde PC")}</span>
                </button>

                {/* Library Upload */}
                <button
                  onClick={() => setShowLibraryPicker(true)}
                  className="flex flex-col items-center justify-center py-3 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700/80 rounded-xl border border-gray-200 dark:border-white/5 text-gray-600 dark:text-gray-300 transition-all hover:border-indigo-500"
                >
                  <FolderOpen className="w-4.5 h-4.5 text-indigo-500 mb-1" />
                  <span className="text-[10px] font-bold">{t("chat.library", "Biblioteca")}</span>
                </button>

                {/* Voice Recorder */}
                <button
                  onClick={() => setShowVoiceRecorder(true)}
                  className="flex flex-col items-center justify-center py-3 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700/80 rounded-xl border border-gray-200 dark:border-white/5 text-gray-600 dark:text-gray-300 transition-all hover:border-indigo-500"
                >
                  <Mic className="w-4.5 h-4.5 text-red-500 mb-1" />
                  <span className="text-[10px] font-bold">{t("chat.voice_note", "Grabar Voz")}</span>
                </button>
              </div>
            )}
          </div>

          {/* Date & Time Picker */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase ml-1">
                <Calendar className="w-3.5 h-3.5" />
                {t("actions.send_date", "Fecha de Envío")}
              </div>
              <input
                type="date"
                className="w-full p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-white/5 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase ml-1">
                <Clock className="w-3.5 h-3.5" />
                {t("actions.local_time", "Hora Local")}
              </div>
              <input
                type="time"
                className="w-full p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-white/5 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* Confirm Button */}
          <button
            onClick={handleConfirm}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black transition-all shadow-lg shadow-indigo-500/30 mt-2 flex items-center justify-center gap-2 group active:scale-[0.98] text-sm"
          >
            <Calendar className="w-4.5 h-4.5 group-hover:rotate-12 transition-transform" />
            {t("actions.schedule_btn", "PROGRAMAR ENVÍO OFICIAL")}
          </button>
        </div>
      </Modal>

      {/* Voice Recorder Overlay Modal */}
      {showVoiceRecorder && (
        <VoiceRecorderModal
          onClose={() => setShowVoiceRecorder(false)}
          onConfirm={handleVoiceNoteConfirm}
        />
      )}

      {/* Media Library Picker Overlay Modal */}
      {showLibraryPicker && (
        <MediaAssetPickerModal
          onClose={() => setShowLibraryPicker(false)}
          onSelect={handleLibrarySelect}
        />
      )}
    </>
  );
};
