import React from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../../ui/Modal";
import { useWhatsAppSessions } from "./useWhatsAppSessions";
import { SessionCard } from "./SessionCard";
import { ConnectionModal } from "./ConnectionModal";

export const WhatsAppTab: React.FC = () => {
  const { t } = useTranslation();
  const wa = useWhatsAppSessions();

  const closeScanningModal = () => {
    wa.setIsScanning(false);
    wa.setCurrentQr(null);
    wa.setScanningSessionId(null);
    wa.setPairingCode(null);
    wa.setPairingPhone("");
    wa.setConnectionMethod("qr");
  };

  return (
    <section className="bg-white dark:bg-reply-panel-dark rounded-2xl border border-gray-200 dark:border-reply-border-dark shadow-sm p-6 md:p-8">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 rounded-lg bg-reply-bg dark:bg-gray-800 flex items-center justify-center text-green-600 dark:text-green-400 flex-shrink-0">
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.253 8.477 3.52 2.266 2.268 3.517 5.28 3.515 8.484-.005 6.66-5.343 11.997-11.958 11.997-2.006 0-3.974-.5-5.729-1.453L0 24zm6.59-4.846c1.6.95 3.197 1.451 4.82 1.452 5.433 0 9.85-4.417 9.854-9.854.002-2.632-1.021-5.109-2.88-6.97C16.58 1.93 14.1 .906 11.464.905c-5.435 0-9.854 4.419-9.858 9.853-.001 2.01.523 3.978 1.517 5.7l-.234.373-3.743.983 1 .288.243.684.058-.058z" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">
              WhatsApp
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[11px] font-bold border border-green-200 dark:border-green-800">
              {wa.sessions.length} {wa.sessions.length === 1 ? t("integrations.whatsapp.one_number", "número") : t("integrations.whatsapp.many_numbers", "números")}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t("integrations.whatsapp.description", "Conecta tu WhatsApp vía Web (Código QR) o API Oficial.")}
          </p>
        </div>
      </div>

      <div className="h-px bg-gray-100 dark:bg-reply-border-dark my-6" />

      {wa.error && (
        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3">
          <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h4 className="font-bold text-red-800 dark:text-red-300 text-sm">{t("common.error.connection_title", "Error de Conexión")}</h4>
            <p className="text-sm text-red-600 dark:text-red-400">{wa.error}</p>
          </div>
          <button
            onClick={wa.fetchSessions}
            className="ml-auto bg-red-100 dark:bg-red-800/40 text-red-800 dark:text-red-300 px-3 py-1 rounded-lg text-xs font-bold hover:bg-red-200 dark:hover:bg-red-800/60"
          >
            {t("common.retry", "Reintentar")}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {wa.sessions.map((session, index) => (
          <SessionCard
            key={session.sessionId}
            session={session}
            index={index}
            queues={wa.queues}
            profileNameDraft={wa.profileNameDrafts[session.sessionId] ?? ""}
            isReconnecting={wa.reconnectingIds.has(session.sessionId)}
            onDelete={wa.handleDeleteSession}
            onReconnect={wa.handleReconnectSession}
            onUpdateQueue={wa.handleUpdateSessionQueue}
            onProfileNameDraftChange={(sessionId, value) =>
              wa.setProfileNameDrafts((prev) => ({ ...prev, [sessionId]: value }))
            }
            onUpdateProfileName={wa.handleUpdateProfileName}
            onViewQr={(sessionId, qrCode) => {
              wa.setCurrentQr(qrCode);
              wa.setScanningSessionId(sessionId);
              wa.setIsScanning(true);
            }}
          />
        ))}

        <button
          onClick={() => {
            wa.setConnectionMethod(wa.reviewModeActive ? "meta" : "qr");
            wa.setPairingCode(null);
            wa.setCurrentQr(null);
            wa.setIsScanning(true);
          }}
          disabled={wa.loading}
          className="group flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-gray-200 dark:border-reply-border-dark hover:border-blue-400 dark:hover:border-blue-500/50 bg-reply-bg/50 dark:bg-reply-surface-dark hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all duration-300 h-full min-h-[220px]"
        >
          <div className="w-14 h-14 rounded-full bg-white dark:bg-gray-800 shadow-sm group-hover:shadow-md group-hover:scale-110 transition-all duration-300 flex items-center justify-center mb-4 text-blue-500">
            {wa.loading ? (
              <svg className="animate-spin w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            )}
          </div>
          <h3 className="text-gray-900 dark:text-white font-bold group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {t("integrations.whatsapp.bind_new", "Vincular Nuevo Dispositivo")}
          </h3>
          <p className="text-sm text-gray-500 text-center mt-1">{t("integrations.whatsapp.connect_another", "Conecta otro número de WhatsApp")}</p>
        </button>
      </div>

      {wa.isScanning && (
        <ConnectionModal
          onClose={closeScanningModal}
          currentQr={wa.currentQr}
          pairingCode={wa.pairingCode}
          loading={wa.loading}
          loadingPairingCode={wa.loadingPairingCode}
          loadingMeta={wa.loadingMeta}
          connectionMethod={wa.connectionMethod}
          setConnectionMethod={wa.setConnectionMethod}
          reviewModeActive={wa.reviewModeActive}
          setReviewModeActive={wa.setReviewModeActive}
          reviewClickCount={wa.reviewClickCount}
          setReviewClickCount={wa.setReviewClickCount}
          onCreateSession={wa.handleCreateSession}
          pairingPhone={wa.pairingPhone}
          setPairingPhone={wa.setPairingPhone}
          onRequestPairingCode={wa.handleRequestPairingCode}
          metaAccessToken={wa.metaAccessToken}
          setMetaAccessToken={wa.setMetaAccessToken}
          metaPhoneNumberId={wa.metaPhoneNumberId}
          setMetaPhoneNumberId={wa.setMetaPhoneNumberId}
          metaBusinessId={wa.metaBusinessId}
          setMetaBusinessId={wa.setMetaBusinessId}
          metaVerifyToken={wa.metaVerifyToken}
          onCreateMetaSession={wa.handleCreateMetaSession}
        />
      )}

      {wa.showUpgradeModal && (
        <Modal
          isOpen={wa.showUpgradeModal}
          onClose={() => wa.setShowUpgradeModal(false)}
          title={t("integrations.whatsapp.upgrade.title", "Límite de Canales Alcanzado")}
          subtitle={t("integrations.whatsapp.upgrade.subtitle", "Mejora tu plan para expandir tu alcance omnichannel")}
        >
          <div className="space-y-4 text-sm text-gray-600 dark:text-gray-400">
            <p>
              {t("integrations.whatsapp.upgrade.description", "Tu plan actual solo permite conectar una sola sesión activa de WhatsApp. Para vincular múltiples números, debes actualizar tu suscripción.")}
            </p>
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => wa.setShowUpgradeModal(false)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition-all active:scale-95"
              >
                {t("common.understand", "Entendido")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
};
