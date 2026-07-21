import React from "react";
import { useTranslation } from "react-i18next";
import { WhatsAppSession, Queue } from "./types";

export const SessionCard: React.FC<{
  session: WhatsAppSession;
  index: number;
  queues: Queue[];
  profileNameDraft: string;
  isReconnecting: boolean;
  onDelete: (sessionId: string) => void;
  onReconnect: (sessionId: string) => void;
  onUpdateQueue: (sessionId: string, queueId: string | null) => void;
  onProfileNameDraftChange: (sessionId: string, value: string) => void;
  onUpdateProfileName: (sessionId: string, name: string) => void;
  onViewQr: (sessionId: string, qrCode: string) => void;
}> = ({
  session,
  index,
  queues,
  profileNameDraft,
  isReconnecting,
  onDelete,
  onReconnect,
  onUpdateQueue,
  onProfileNameDraftChange,
  onUpdateProfileName,
  onViewQr,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={`group bg-white dark:bg-reply-panel-dark rounded-2xl border border-gray-200 dark:border-reply-border-dark shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden ${session.status === "SCANNING" ? "ring-2 ring-yellow-400/50 dark:ring-yellow-500/30" : ""}`}
    >
      <div
        className={`absolute top-0 left-0 w-full h-1 ${
          session.status === "CONNECTED"
            ? "bg-gradient-to-r from-green-400 to-green-600"
            : session.status === "DISCONNECTED" || session.status === "FAILED"
              ? "bg-gradient-to-r from-red-400 to-red-600"
              : "bg-gradient-to-r from-yellow-400 to-amber-500 animate-pulse"
        }`}
      ></div>
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center text-green-600 dark:text-green-400">
              <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </div>
            <div className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white dark:border-reply-panel-dark shadow-sm z-10">
              {index + 1}
            </div>
          </div>
          <div className="px-2.5 py-1 rounded-full bg-reply-bg dark:bg-gray-800 border border-gray-100 dark:border-reply-border-dark flex items-center gap-2 shadow-sm">
            <div
              className={`w-2 h-2 rounded-full ${
                session.status === "CONNECTED"
                  ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                  : session.status === "DISCONNECTED" || session.status === "FAILED"
                    ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                    : "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)] animate-pulse"
              }`}
            ></div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {session.status === "DISCONNECTED" ? t("integrations.whatsapp.status.disconnected", "Desconectado") : session.status === "FAILED" ? t("integrations.whatsapp.status.failed", "Fallido") : session.status}
            </span>
          </div>
        </div>

        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
          WhatsApp Web
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 font-mono mb-4 truncate">
          {session.status === "SCANNING"
            ? t("integrations.whatsapp.waiting_scan", "Esperando escaneo...")
            : session.status === "DISCONNECTED"
              ? t("integrations.whatsapp.disconnected_desc", "Sesión desconectada")
              : session.status === "FAILED"
                ? t("integrations.whatsapp.failed_desc", "Conexión fallida")
                : session.phone
                  ? `+${session.phone}`
                  : t("common.unknown", "Desconocido")}
        </p>

        <div className="mb-4">
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
            {t("integrations.whatsapp.default_queue", "Cola Predeterminada")}
          </label>
          <select
            disabled={session.status !== "CONNECTED"}
            value={session.defaultQueueId || ""}
            onChange={(e) => onUpdateQueue(session.sessionId, e.target.value)}
            className="w-full text-xs p-2 rounded-lg border border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-green-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">{t("integrations.whatsapp.no_queue_assigned", "-- Sin Cola Asignada --")}</option>
            {queues.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </select>
        </div>

        {session.status === "CONNECTED" && (
          <div className="mb-4">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              {t("integrations.whatsapp.profile_name", "Nombre de Perfil de WhatsApp")}
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                maxLength={25}
                placeholder={t("integrations.whatsapp.profile_placeholder", "Ej: Soporte Sentry CRM")}
                value={profileNameDraft ?? ""}
                onChange={(e) => onProfileNameDraftChange(session.sessionId, e.target.value)}
                className="flex-1 text-xs p-2 rounded-lg border border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-green-500 outline-none transition-all"
              />
              <button
                onClick={() => onUpdateProfileName(session.sessionId, profileNameDraft || "")}
                disabled={!profileNameDraft?.trim()}
                className="px-3 py-2 text-xs font-semibold text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors border border-green-100 dark:border-green-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t("common.save", "Guardar")}
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-reply-border-dark">
          <button
            onClick={() => onDelete(session.sessionId)}
            className="flex-1 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-transparent hover:border-red-100 dark:hover:border-red-900/30"
          >
            {session.status === "SCANNING" ? t("common.cancel", "Cancelar") : t("common.disconnect", "Desconectar")}
          </button>
          {(session.status === "DISCONNECTED" || session.status === "FAILED") && (
            <button
              disabled={isReconnecting}
              onClick={() => onReconnect(session.sessionId)}
              className="flex-1 px-3 py-2 text-xs font-semibold text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors border border-transparent hover:border-green-100 dark:hover:border-green-900/30 flex items-center justify-center gap-1 disabled:opacity-50"
            >
              {isReconnecting ? (
                <>
                  <svg className="animate-spin h-3 w-3 text-green-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t("common.reconnecting", "Reconectando...")}
                </>
              ) : (
                t("common.reconnect", "Reconectar")
              )}
            </button>
          )}
          {session.status === "SCANNING" && session.qrCode && (
            <button
              onClick={() => onViewQr(session.sessionId, session.qrCode as string)}
              className="flex-1 px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors border border-transparent hover:border-blue-100 dark:hover:border-blue-900/30"
            >
              {t("integrations.whatsapp.view_qr", "Ver QR")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
