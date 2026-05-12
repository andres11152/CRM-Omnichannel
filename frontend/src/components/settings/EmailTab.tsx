import React from "react";
import { useTranslation } from "react-i18next";
import type { SettingsTabProps } from "./SettingsShared";

interface EmailTabProps extends SettingsTabProps {
  testingConnection: boolean;
  helpTab: "gmail" | "outlook" | "zoho" | "cpanel";
  setHelpTab: (tab: "gmail" | "outlook" | "zoho" | "cpanel") => void;
  handleTestEmail: () => Promise<void>;
}

export const EmailTab: React.FC<EmailTabProps> = ({
  settings,
  updateSetting,
  testingConnection,
  helpTab,
  setHelpTab,
  handleTestEmail,
}) => {
  const { t } = useTranslation();
  const smtp = settings.smtp;

  return (
    <div className="space-y-6 animate-fadeIn text-gray-800 dark:text-gray-100">
      <div className="bg-white dark:bg-reply-panel-dark p-6 md:p-8 rounded-2xl border border-gray-200 dark:border-reply-border-dark shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-6 border-b border-gray-100 dark:border-reply-border-dark/60">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {t("company_settings.email.title", "Configuración de Email / SMTP")}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {t("company_settings.email.subtitle", "Configura tu propio servidor de correos salientes para campañas y tickets.")}
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center gap-3">
            <span className="text-[10px] items-center gap-1 font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 px-3 py-1 rounded-full uppercase flex">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span> AES-256-GCM
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Host */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-tight">
              {t("company_settings.email.host", "Servidor SMTP / Host")}
            </label>
            <input
              type="text"
              value={smtp.host}
              onChange={(e) => updateSetting("smtp", "host", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none font-medium"
              placeholder="smtp.example.com"
            />
          </div>

          {/* Port & Secure Container */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-tight">
                {t("company_settings.email.port", "Puerto")}
              </label>
              <input
                type="number"
                value={smtp.port || ""}
                onChange={(e) => updateSetting("smtp", "port", parseInt(e.target.value) || 0)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none font-medium"
                placeholder="587"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-tight">
                {t("company_settings.email.secure", "Conexión Segura")}
              </label>
              <select
                value={smtp.secure ? "true" : "false"}
                onChange={(e) => updateSetting("smtp", "secure", e.target.value === "true")}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none font-medium appearance-none"
              >
                <option value="false">STARTTLS / TLS (587)</option>
                <option value="true">SSL (465)</option>
              </select>
            </div>
          </div>

          {/* User */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-tight">
              {t("company_settings.email.user", "Usuario / Correo")}
            </label>
            <input
              type="text"
              value={smtp.user}
              onChange={(e) => updateSetting("smtp", "user", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none font-medium"
              placeholder="tu@correo.com"
            />
          </div>

          {/* Password */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-tight">
              {t("company_settings.email.password", "Contraseña")}
            </label>
            <input
              type="password"
              value={smtp.password}
              onChange={(e) => updateSetting("smtp", "password", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none font-medium"
              placeholder={smtp.hasPassword ? "••••••••••••" : "Ingresa contraseña"}
            />
          </div>

          {/* Sender Email */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-tight">
              {t("company_settings.email.sender_email", "Correo Remitente")}
            </label>
            <input
              type="email"
              value={smtp.senderEmail}
              onChange={(e) => updateSetting("smtp", "senderEmail", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none font-medium"
              placeholder="no-reply@tuempresa.com"
            />
          </div>

          {/* Sender Name */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-tight">
              {t("company_settings.email.sender_name", "Nombre Remitente")}
            </label>
            <input
              type="text"
              value={smtp.senderName}
              onChange={(e) => updateSetting("smtp", "senderName", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none font-medium"
              placeholder="Reply CRM"
            />
          </div>
        </div>

        {/* Test Connection Box */}
        <div className="mt-8 p-6 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-xl mt-1 shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h4 className="font-bold text-gray-900 dark:text-white">{t("company_settings.email.test_title", "Prueba tu Conexión")}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t("company_settings.email.test_desc", "Te enviaremos un correo electrónico de prueba al instante para asegurar que la configuración es correcta.")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleTestEmail}
            disabled={testingConnection}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap text-sm disabled:opacity-50 disabled:pointer-events-none"
          >
            {testingConnection ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>{t("company_settings.email.testing", "Probando...")}</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                <span>{t("company_settings.email.test_btn", "Enviar Correo de Prueba")}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Interactive Helper Cards */}
      <div className="bg-white dark:bg-reply-panel-dark p-6 md:p-8 rounded-2xl border border-gray-200 dark:border-reply-border-dark shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          {t("company_settings.email.guides_title", "Guías Rápidas de Configuración")}
        </h3>

        {/* Tab Header */}
        <div className="flex border-b border-gray-200 dark:border-reply-border-dark/60 overflow-x-auto no-scrollbar mb-6">
          <button
            onClick={() => setHelpTab("gmail")}
            className={`py-3 px-5 font-bold text-sm border-b-2 transition-all whitespace-nowrap ${
              helpTab === "gmail"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Google / Gmail
          </button>
          <button
            onClick={() => setHelpTab("outlook")}
            className={`py-3 px-5 font-bold text-sm border-b-2 transition-all whitespace-nowrap ${
              helpTab === "outlook"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Outlook / Office 365
          </button>
          <button
            onClick={() => setHelpTab("zoho")}
            className={`py-3 px-5 font-bold text-sm border-b-2 transition-all whitespace-nowrap ${
              helpTab === "zoho"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Zoho Mail
          </button>
          <button
            onClick={() => setHelpTab("cpanel")}
            className={`py-3 px-5 font-bold text-sm border-b-2 transition-all whitespace-nowrap ${
              helpTab === "cpanel"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            cPanel / Servidor Propio
          </button>
        </div>

        {/* Tab Body */}
        <div className="text-sm leading-relaxed text-gray-600 dark:text-gray-300 animate-fadeIn">
          {helpTab === "gmail" && (
            <div className="space-y-4">
              <p className="font-semibold text-gray-800 dark:text-white">
                Para usar Gmail, necesitas crear una <strong className="text-indigo-600 dark:text-indigo-400">Contraseña de Aplicación</strong>. Tu contraseña estándar de Google NO funcionará por políticas de seguridad.
              </p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>Ve a tu Cuenta de Google (Seguridad).</li>
                <li>Activa la <strong>Verificación en 2 pasos</strong> si aún no lo has hecho.</li>
                <li>Busca <strong>Contraseñas de aplicación</strong> al final de la sección.</li>
                <li>Genera una nueva contraseña asignándole un nombre como "Reply CRM".</li>
                <li>Copia la contraseña de 16 caracteres y pégala aquí.</li>
              </ol>
              <div className="mt-4 p-4 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-reply-border-dark/60 grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs text-gray-500">
                <div><strong>Host:</strong> smtp.gmail.com</div>
                <div><strong>Puerto:</strong> 587 (STARTTLS)</div>
                <div><strong>Puerto alternativo:</strong> 465 (SSL)</div>
              </div>
            </div>
          )}

          {helpTab === "outlook" && (
            <div className="space-y-4">
              <p className="font-semibold text-gray-800 dark:text-white">
                Office 365 requiere habilitar el acceso SMTP autenticado antes de poder realizar envíos.
              </p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>Pide al administrador de TI que habilite <strong>SMTP autenticado</strong> para tu buzón en el centro de administración de Microsoft 365.</li>
                <li>Si tienes MFA (autenticación multifactor), crea una <strong>Contraseña de Aplicación</strong> desde tu panel de Microsoft.</li>
              </ol>
              <div className="mt-4 p-4 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-reply-border-dark/60 grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs text-gray-500">
                <div><strong>Host:</strong> outlook.office365.com</div>
                <div><strong>Puerto:</strong> 587 (STARTTLS)</div>
              </div>
            </div>
          )}

          {helpTab === "zoho" && (
            <div className="space-y-4">
              <p className="font-semibold text-gray-800 dark:text-white">
                Zoho Mail requiere contraseñas específicas de aplicación si cuentas con autenticación de dos factores (2FA).
              </p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>Inicia sesión en Zoho Mail, ve a tu Perfil → Seguridad.</li>
                <li>En <strong>Contraseñas de Aplicaciones</strong>, genera una clave exclusiva para Reply.</li>
              </ol>
              <div className="mt-4 p-4 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-reply-border-dark/60 grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs text-gray-500">
                <div><strong>Host:</strong> smtp.zoho.com</div>
                <div><strong>Puerto:</strong> 465 (SSL)</div>
                <div><strong>Puerto alternativo:</strong> 587 (STARTTLS)</div>
              </div>
            </div>
          )}

          {helpTab === "cpanel" && (
            <div className="space-y-4">
              <p className="font-semibold text-gray-800 dark:text-white">
                Configuración sugerida para correos administrados en cPanel, Hostinger, CleverCloud u otros proveedores independientes.
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Utiliza preferiblemente el <strong>puerto 465 (SSL)</strong> para servidores propios, ya que ofrece mayor cifrado y velocidad de handshake inicial.</li>
                <li>Asegúrate de que el Correo Remitente coincida exactamente con el Correo del Usuario SMTP para evitar penalizaciones en el puntaje de SPAM (SPF/DKIM alignment).</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
