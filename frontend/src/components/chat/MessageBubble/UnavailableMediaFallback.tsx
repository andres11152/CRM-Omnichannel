import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { Message } from "@/types";
import { api } from "@/lib/axios";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CHAT_KEYS } from "@/hooks/useChat";

export const UnavailableMediaFallback: React.FC<{ message: Message; type: string }> = ({ message, type }) => {
  const { t } = useTranslation();
  const [isRetrying, setIsRetrying] = useState(false);
  const queryClient = useQueryClient();

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const response = await api.post(`/conversations/${message.ticketId || "0"}/messages/${message.id}/retry-media`);

      if (response.data.status === "success") {
        toast.success(t("unavailable_media_fallback.toast.recovered", "Archivo recuperado"));
        // Refresh the chat so the recovered media renders immediately (instead of after reopen)
        if (message.ticketId) {
          queryClient.invalidateQueries({ queryKey: CHAT_KEYS.messages(message.ticketId) });
        }
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }, message?: string };
      const errorMsg = err.response?.data?.message || err.message || t("unavailable_media_fallback.toast.recover_error", "Error al recuperar el archivo.");
      toast.error(errorMsg);
    } finally {
      setIsRetrying(false);
    }
  };

  const getLabel = () => {
    switch (type) {
      case "image": return "Imagen";
      case "video": return "Video";
      case "audio": return "Audio";
      case "sticker": return "Sticker";
      default: return "Archivo";
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3 bg-black/5 dark:bg-white/5 rounded-lg mb-2 border border-dashed border-gray-300 dark:border-gray-600">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 italic">
          {getLabel()} no disponible
        </span>
      </div>
      <button
        onClick={handleRetry}
        disabled={isRetrying}
        className="flex items-center justify-center gap-2 text-[11px] bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 py-1.5 px-3 rounded-md font-medium transition-colors border border-indigo-200 dark:border-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isRetrying ? (
          <>
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Recuperando...
          </>
        ) : (
          <>
            <Download className="w-3 h-3" />
            Reintentar Descarga
          </>
        )}
      </button>
    </div>
  );
};
