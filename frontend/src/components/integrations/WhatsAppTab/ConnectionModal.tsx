import React from "react";
import { toast } from "sonner";
import QRCode from "react-qr-code";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "@/services/apiConfig";

export const ConnectionModal: React.FC<{
  onClose: () => void;
  currentQr: string | null;
  pairingCode: string | null;
  loading: boolean;
  loadingPairingCode: boolean;
  loadingMeta: boolean;
  connectionMethod: "qr" | "phone" | "meta";
  setConnectionMethod: (m: "qr" | "phone" | "meta") => void;
  reviewModeActive: boolean;
  setReviewModeActive: (v: boolean) => void;
  reviewClickCount: number;
  setReviewClickCount: (n: number) => void;
  onCreateSession: () => void;
  pairingPhone: string;
  setPairingPhone: (v: string) => void;
  onRequestPairingCode: (e: React.FormEvent) => void;
  metaAccessToken: string;
  setMetaAccessToken: (v: string) => void;
  metaPhoneNumberId: string;
  setMetaPhoneNumberId: (v: string) => void;
  metaBusinessId: string;
  setMetaBusinessId: (v: string) => void;
  metaVerifyToken: string;
  onCreateMetaSession: (e: React.FormEvent) => void;
}> = ({
  onClose,
  currentQr,
  pairingCode,
  loading,
  loadingPairingCode,
  loadingMeta,
  connectionMethod,
  setConnectionMethod,
  reviewModeActive,
  setReviewModeActive,
  reviewClickCount,
  setReviewClickCount,
  onCreateSession,
  pairingPhone,
  setPairingPhone,
  onRequestPairingCode,
  metaAccessToken,
  setMetaAccessToken,
  metaPhoneNumberId,
  setMetaPhoneNumberId,
  metaBusinessId,
  setMetaBusinessId,
  metaVerifyToken,
  onCreateMetaSession,
}) => {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto custom-scrollbar border border-gray-100 dark:border-gray-800 flex flex-col md:flex-row relative md:min-h-[350px]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors bg-white/10 rounded-full p-1 scroll-m-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {!currentQr && !pairingCode && !loading && !loadingPairingCode ? (
          <div className="flex-1 p-6 sm:p-8 flex flex-col justify-center bg-white dark:bg-gray-900">
            <div className="mb-6 text-center">
              <h3
                onClick={() => {
                  const nextCount = reviewClickCount + 1;
                  if (nextCount >= 5) {
                    const nextState = !reviewModeActive;
                    setReviewModeActive(nextState);
                    setConnectionMethod(nextState ? "meta" : "qr");
                    localStorage.setItem("isReviewMode", nextState ? "true" : "false");
                    toast.success(
                      nextState
                        ? t("integrations.whatsapp.review_mode_on", "Modo Auditoría Activado")
                        : t("integrations.whatsapp.review_mode_off", "Modo Auditoría Desactivado"),
                    );
                    setReviewClickCount(0);
                  } else {
                    setReviewClickCount(nextCount);
                  }
                }}
                className="text-xl font-bold text-gray-900 dark:text-white mb-2 cursor-pointer select-none"
              >
                {t("integrations.whatsapp.bind_title", "Vincular WhatsApp")}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t("integrations.whatsapp.choose_method", "Elige el método de vinculación que prefieras para tu dispositivo.")}
              </p>
            </div>

            <div className="flex border-b border-gray-200 dark:border-gray-800 mb-6">
              {!reviewModeActive && (
                <>
                  <button
                    onClick={() => setConnectionMethod("qr")}
                    className={`flex-1 py-3 text-xs font-bold border-b-2 transition-all ${
                      connectionMethod === "qr"
                        ? "border-green-500 text-green-600 dark:text-green-400 font-bold"
                        : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                  >
                    {t("integrations.whatsapp.qr_code", "Código QR")}
                  </button>
                  <button
                    onClick={() => setConnectionMethod("phone")}
                    className={`flex-1 py-3 text-xs font-bold border-b-2 transition-all ${
                      connectionMethod === "phone"
                        ? "border-green-500 text-green-600 dark:text-green-400 font-bold"
                        : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                  >
                    {t("integrations.whatsapp.phone_code", "Código de Teléfono")}
                  </button>
                </>
              )}
              <button
                onClick={() => setConnectionMethod("meta")}
                className={`flex-1 py-3 text-xs font-bold border-b-2 transition-all ${
                  connectionMethod === "meta"
                    ? "border-green-500 text-green-600 dark:text-green-400 font-bold"
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {t("integrations.whatsapp.meta_api", "Meta Cloud API (Oficial)")}
              </button>
            </div>

            {connectionMethod === "qr" && (
              <div className="space-y-4">
                <button
                  onClick={onCreateSession}
                  disabled={loading}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all shadow-md active:scale-95"
                >
                  {loading ? t("common.starting", "Iniciando...") : t("integrations.whatsapp.generate_qr", "Generar Código QR")}
                </button>
              </div>
            )}

            {connectionMethod === "phone" && (
              <form onSubmit={onRequestPairingCode} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    {t("integrations.whatsapp.phone_number_label", "Número de Teléfono (con código de país)")}
                  </label>
                  <input
                    type="tel"
                    value={pairingPhone}
                    onChange={(e) => setPairingPhone(e.target.value)}
                    placeholder="Ej: 573001234567"
                    className="w-full px-4 py-3 bg-reply-bg dark:bg-gray-800 border border-gray-200 dark:border-reply-border-dark rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-sm font-semibold text-gray-900 dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loadingPairingCode}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all shadow-md active:scale-95"
                >
                  {loadingPairingCode ? t("common.requesting", "Solicitando...") : t("integrations.whatsapp.get_pairing_code", "Obtener Código de Vinculación")}
                </button>
              </form>
            )}

            {connectionMethod === "meta" && (
              <form onSubmit={onCreateMetaSession} className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                      {t("integrations.whatsapp.meta.access_token", "Meta Access Token (Token de Acceso Permanente)")}
                    </label>
                    <input
                      type="password"
                      value={metaAccessToken}
                      onChange={(e) => setMetaAccessToken(e.target.value)}
                      placeholder="EAABw..."
                      className="w-full px-3.5 py-2.5 bg-reply-bg dark:bg-gray-800 border border-gray-200 dark:border-reply-border-dark rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-xs font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                        Phone Number ID
                      </label>
                      <input
                        type="text"
                        value={metaPhoneNumberId}
                        onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                        placeholder="1098..."
                        className="w-full px-3.5 py-2.5 bg-reply-bg dark:bg-gray-800 border border-gray-200 dark:border-reply-border-dark rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                        WABA Business ID
                      </label>
                      <input
                        type="text"
                        value={metaBusinessId}
                        onChange={(e) => setMetaBusinessId(e.target.value)}
                        placeholder="9876..."
                        className="w-full px-3.5 py-2.5 bg-reply-bg dark:bg-gray-800 border border-gray-200 dark:border-reply-border-dark rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-xs"
                      />
                    </div>
                  </div>
                  <div className="bg-reply-bg dark:bg-gray-800/80 p-3 rounded-xl border border-gray-200/50 dark:border-reply-border-dark text-[11px] text-gray-500">
                    <span className="font-bold block mb-1">{t("integrations.whatsapp.meta.webhook_config", "Configuración del Webhook:")}</span>
                    {t("integrations.whatsapp.meta.webhook_url", "URL de Webhook:")} <code className="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-[10px] break-all">{`${API_BASE_URL.replace("/api", "")}/whatsapp/webhook`}</code>
                    <br />
                    {t("integrations.whatsapp.meta.verify_token", "Token de Verificación:")} <code className="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-[10px] select-all">{metaVerifyToken}</code>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loadingMeta}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all shadow-md active:scale-95 mt-2"
                >
                  {loadingMeta ? t("common.linking", "Vinculando...") : t("integrations.whatsapp.meta.save", "Guardar Configuración Meta")}
                </button>
              </form>
            )}
          </div>
        ) : currentQr ? (
          <div className="flex-1 flex flex-col md:flex-row bg-white dark:bg-gray-900">
            <div className="flex-1 p-6 sm:p-8 flex flex-col justify-center border-b md:border-b-0 md:border-r border-gray-100 dark:border-gray-800">
              <div className="mb-6">
                <span className="px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 text-xs font-bold border border-green-100 dark:border-green-900">
                  {t("common.step_1_of_2", "Paso 1 de 2")}
                </span>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-3">{t("integrations.whatsapp.scan_title", "Escanea el código QR")}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {t("integrations.whatsapp.scan_instructions", "Abre WhatsApp en tu teléfono, ve a Dispositivos vinculados y selecciona Vincular un dispositivo.")}
                </p>
              </div>
              <div className="flex justify-center p-4 bg-white rounded-2xl shadow-inner border border-gray-100 dark:border-gray-800 w-fit mx-auto">
                <QRCode value={currentQr} size={220} />
              </div>
            </div>
            <div className="w-full md:w-[260px] bg-gray-50/50 dark:bg-gray-900/30 p-6 sm:p-8 flex flex-col justify-center">
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 text-xs font-bold shrink-0">1</div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-normal">
                    {t("integrations.whatsapp.helper_step1", "Apunta la cámara de tu celular hacia la pantalla para escanear el código QR.")}
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 text-xs font-bold shrink-0">2</div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-normal">
                    {t("integrations.whatsapp.helper_step2", "Una vez escaneado, la sesión se vinculará automáticamente. No cierres esta ventana.")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : pairingCode ? (
          <div className="flex-1 flex flex-col md:flex-row bg-white dark:bg-gray-900">
            <div className="flex-1 p-6 sm:p-8 flex flex-col justify-center border-b md:border-b-0 md:border-r border-gray-100 dark:border-gray-800">
              <div className="mb-6">
                <span className="px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 text-xs font-bold border border-green-100 dark:border-green-900">
                  {t("common.step_1_of_2", "Paso 1 de 2")}
                </span>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-3">{t("integrations.whatsapp.enter_code_title", "Ingresa el código")}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {t("integrations.whatsapp.enter_code_instructions", "Abre la notificación de WhatsApp en tu celular o entra a Dispositivos vinculados > Vincular con número de teléfono.")}
                </p>
              </div>
              <div className="flex justify-center p-6 bg-gray-50 dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 w-full max-w-sm mx-auto shadow-inner">
                <span className="text-4xl font-mono font-black tracking-widest text-green-600 dark:text-green-400 select-all">
                  {pairingCode}
                </span>
              </div>
            </div>
            <div className="w-full md:w-[260px] bg-gray-50/50 dark:bg-gray-900/30 p-6 sm:p-8 flex flex-col justify-center">
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 text-xs font-bold shrink-0">1</div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-normal">
                    {t("integrations.whatsapp.helper_code_step1", "Entra a WhatsApp Web en tu celular e ingresa con número de teléfono.")}
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 text-xs font-bold shrink-0">2</div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-normal">
                    {t("integrations.whatsapp.helper_code_step2", "Digita el código de 8 caracteres que ves a la izquierda en tu dispositivo.")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
