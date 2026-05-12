import React from "react";
import { useTranslation } from "react-i18next";
import { ModuleHeader } from "./common/ModuleHeader";
import SoundSettings from "./SoundSettings";
import PermissionsPanel from "./PermissionsPanel";

// Hook (Single Source of Truth for state)
import { useCompanySettings } from "@/hooks/useCompanySettings";

// Sub-components (Pure Presentational)
import { NavButton } from "./settings/SettingsShared";
import { GeneralTab } from "./settings/GeneralTab";
import { BusinessHoursTab } from "./settings/BusinessHoursTab";
import { SecurityTab } from "./settings/SecurityTab";
import { EmailTab } from "./settings/EmailTab";

// ────────────────────────────────────────────────
// LAZY INLINE TABS (Automation, Email, Billing)
// These tabs are rendered inline to preserve the existing JSX verbatim.
// They can be extracted to their own files in a future pass.
// ────────────────────────────────────────────────

/**
 * CompanySettings — Thin Orchestrator
 *
 * Architecture: Hook + Sub-components pattern (same as AgentWorkspace).
 * - useCompanySettings(): All state, data fetching, business logic
 * - GeneralTab, BusinessHoursTab, SecurityTab: Pure presentational
 * - Automation, Email, Billing: Inline (pending extraction)
 */
export const CompanySettings: React.FC = () => {
  const { t } = useTranslation();
  const ctx = useCompanySettings();

  const {
    activeTab,
    setActiveTab,
    settings,
    loading,
    testingConnection,
    helpTab,
    setHelpTab,
    planData,
    passwords,
    setPasswords,
    googleCalendarConnected,
    pickerOpen,
    setPickerOpen,
    pickerTarget,
    setPickerTarget,
    uploadingImage,
    updateSetting,
    updateBusinessHour,
    handleSave,
    handleTestEmail,
    handleAvatarSelect,
    handleFileUpload,
    handleGoogleDisconnect,
    handleGoogleConnect,
    user,
  } = ctx;

  // ── Avatar Picker Modal ──
  const AvatarPickerModal = () => {
    if (!pickerOpen) return null;

    const predeterminedAvatars = [
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`,
      `https://api.dicebear.com/7.x/bottts/svg?seed=${Math.random()}`,
      `https://api.dicebear.com/7.x/initials/svg?seed=${Math.random()}`,
      `https://api.dicebear.com/7.x/micah/svg?seed=${Math.random()}`,
      `https://api.dicebear.com/7.x/notionists/svg?seed=${Math.random()}`,
      `https://api.dicebear.com/7.x/personas/svg?seed=${Math.random()}`,
      "https://ui-avatars.com/api/?name=User&background=0D8ABC&color=fff",
      "https://ui-avatars.com/api/?name=Company&background=random",
    ];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white dark:bg-reply-panel-dark rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-reply-border-dark flex justify-between items-center">
            <h3 className="font-bold text-lg text-gray-800 dark:text-white">
              {pickerTarget === "user" ? t("company_settings.avatar_modal.select_profile", "Seleccionar Foto de Perfil") : t("company_settings.avatar_modal.select_logo", "Seleccionar Logo de Empresa")}
            </h3>
            <button onClick={() => setPickerOpen(false)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">✕</button>
          </div>

          <div className="p-6">
            <h4 className="text-sm font-bold text-gray-500 mb-3 uppercase tracking-wider">{t("company_settings.avatar_modal.upload_title", "Subir Imagen")}</h4>
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-reply-bg dark:hover:bg-gray-800 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                {uploadingImage ? (
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                ) : (
                  <>
                    <svg className="w-8 h-8 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                    </svg>
                    <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                      <span className="font-semibold">{t("company_settings.avatar_modal.click_upload", "Haz clic para subir")}</span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t("company_settings.avatar_modal.constraints", "PNG, JPG or GIF (MAX. 5MB)")}</p>
                  </>
                )}
              </div>
              <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={uploadingImage} />
            </label>

            <div className="relative flex py-5 items-center">
              <div className="flex-grow border-t border-gray-200 dark:border-reply-border-dark"></div>
              <span className="flex-shrink-0 mx-4 text-gray-400 text-xs uppercase">{t("company_settings.avatar_modal.choose_predetermined", "O elige uno predeterminado")}</span>
              <div className="flex-grow border-t border-gray-200 dark:border-reply-border-dark"></div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              {predeterminedAvatars.map((url, i) => (
                <button
                  key={i}
                  onClick={() => handleAvatarSelect(url)}
                  className="aspect-square rounded-full overflow-hidden border-2 border-transparent hover:border-indigo-500 transition-all hover:scale-105"
                >
                  <img src={url} alt="Avatar" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Tab Content Router ──
  const renderTabContent = () => {
    switch (activeTab) {
      case "general":
        return (
          <GeneralTab
            settings={settings}
            updateSetting={updateSetting}
            loading={loading}
            uploadingImage={uploadingImage}
            onPickerOpen={() => { setPickerTarget("company"); setPickerOpen(true); }}
          />
        );

      case "hours":
        return (
          <BusinessHoursTab
            settings={settings}
            updateSetting={updateSetting}
            loading={loading}
            updateBusinessHour={updateBusinessHour}
          />
        );

      case "automation":
        return (
          <div className="space-y-6 animate-fadeIn">
            {/* Welcome Message Card */}
            <div className="bg-white dark:bg-reply-panel-dark p-5 md:p-8 rounded-2xl border border-gray-200 dark:border-reply-border-dark shadow-sm relative group overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                <svg className="w-24 h-24 text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                </svg>
              </div>
              <div className="flex items-center gap-3 mb-4 relative z-10">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-white">{t("company_settings.automation.welcome_title", "Respuesta de Bienvenida")}</h3>
              </div>
              <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                {t("company_settings.automation.welcome_desc", "Este mensaje se enviará automáticamente a nuevos contactos o tras 24h de inactividad.")}
              </p>
              <textarea
                className="w-full h-32 border border-gray-200 dark:border-reply-border-dark rounded-2xl p-4 text-sm bg-reply-bg dark:bg-black/20 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none resize-none no-scrollbar font-medium"
                value={settings.automation.welcomeMessage}
                onChange={(e) => updateSetting("automation", "welcomeMessage", e.target.value)}
                placeholder={t("company_settings.automation.welcome_placeholder", "¡Hola! Gracias por contactarnos...")}
              ></textarea>
            </div>

            {/* OOO Message Card */}
            <div className="bg-white dark:bg-reply-panel-dark p-5 md:p-8 rounded-2xl border border-gray-200 dark:border-reply-border-dark shadow-sm relative group overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                <svg className="w-24 h-24 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                </svg>
              </div>
              <div className="flex justify-between items-center mb-4 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 dark:text-white">{t("company_settings.automation.ooo_title", "Horario de Ausencia (OOO)")}</h3>
                </div>
                <span className="text-[10px] items-center gap-1 font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full uppercase hidden sm:flex">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> {t("company_settings.automation.auto_system", "Sistema Auto")}
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                {t("company_settings.automation.ooo_desc", "Se envía automáticamente cuando un cliente escribe fuera de tu horario laboral configurado.")}
              </p>
              <textarea
                className="w-full h-32 border border-gray-200 dark:border-reply-border-dark rounded-2xl p-4 text-sm bg-reply-bg dark:bg-black/20 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all outline-none resize-none no-scrollbar font-medium"
                value={settings.automation.oooMessage}
                onChange={(e) => updateSetting("automation", "oooMessage", e.target.value)}
                placeholder={t("company_settings.automation.ooo_placeholder", "Lo sentimos, en este momento no estamos disponibles...")}
              ></textarea>
            </div>

            {/* Google Calendar Integration */}
            <div className="bg-white dark:bg-reply-panel-dark p-6 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white">{t("company_settings.google_calendar.title", "Google Calendar")}</h3>
                {googleCalendarConnected ? (
                  <span className="text-xs font-bold bg-green-100 text-green-800 px-3 py-1 rounded-full flex items-center gap-1">✓ {t("company_settings.google_calendar.connected", "Conectado")}</span>
                ) : (
                  <span className="text-xs font-bold bg-gray-100 text-gray-600 px-3 py-1 rounded-full">{t("company_settings.google_calendar.not_connected", "No Conectado")}</span>
                )}
              </div>
              <p className="text-sm text-gray-500 mb-4">{t("company_settings.google_calendar.desc", "Sincroniza automáticamente tus reuniones del CRM con Google Calendar.")}</p>
              {googleCalendarConnected ? (
                <button onClick={handleGoogleDisconnect} className="text-sm text-red-600 hover:text-red-700 font-bold">{t("company_settings.google_calendar.disconnect", "Desconectar")}</button>
              ) : (
                <button
                  onClick={handleGoogleConnect}
                  className="bg-white border-2 border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-semibold hover:bg-reply-bg transition-colors flex items-center gap-2"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  {t("company_settings.google_calendar.connect", "Conectar con Google")}
                </button>
              )}
            </div>
          </div>
        );

      case "security":
        return (
          <SecurityTab
            passwords={passwords}
            setPasswords={setPasswords}
            loading={loading}
            handleSave={handleSave}
          />
        );

      case "email":
        return (
          <EmailTab
            settings={settings}
            updateSetting={updateSetting}
            loading={loading}
            testingConnection={testingConnection}
            helpTab={helpTab}
            setHelpTab={setHelpTab}
            handleTestEmail={handleTestEmail}
          />
        );

      case "sound":
        return <SoundSettings />;

      case "permissions":
        return <PermissionsPanel />;

      default:
        return null;
    }
  };

  return (
    <div className="h-full bg-reply-bg dark:bg-reply-bg-dark flex flex-col transition-colors duration-200">
      <ModuleHeader
        title={t("company_settings.title", "Configuración de Empresa")}
        description={t("company_settings.description", "Gestiona tu perfil, horarios y automatizaciones.")}
        icon={
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        }
        gradient="from-indigo-600 to-blue-600 dark:from-indigo-800 dark:to-blue-800"
      />

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* Sidebar Tabs */}
        <div className="w-full md:w-64 bg-white dark:bg-reply-surface-dark border-b md:border-b-0 md:border-r border-gray-200 dark:border-reply-border-dark flex flex-row md:flex-col overflow-x-auto md:overflow-visible no-scrollbar shrink-0">
          <NavButton active={activeTab === "general"} onClick={() => setActiveTab("general")} icon={<path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />} label={t("company_settings.nav.general", "General")} />
          <NavButton active={activeTab === "hours"} onClick={() => setActiveTab("hours")} icon={<path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />} label={t("company_settings.nav.hours", "Horarios")} />
          <NavButton active={activeTab === "automation"} onClick={() => setActiveTab("automation")} icon={<path d="M13 10V3L4 14h7v7l9-11h-7z" />} label={t("company_settings.nav.automation", "Automatización")} />
          <NavButton active={activeTab === "email"} onClick={() => setActiveTab("email")} icon={<path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />} label={t("company_settings.nav.email", "Email")} fullLabel={t("company_settings.nav.email_full", "Email / SMTP")} />
          <NavButton active={activeTab === "security"} onClick={() => setActiveTab("security")} icon={<path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />} label={t("company_settings.nav.security", "Seguridad")} />
          <NavButton active={activeTab === "billing"} onClick={() => setActiveTab("billing")} icon={<path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />} label={t("company_settings.nav.billing", "Facturación")} />
          <NavButton active={activeTab === "sound"} onClick={() => setActiveTab("sound")} icon={<path d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />} label={t("company_settings.nav.sound", "Sonido")} />
          <NavButton active={activeTab === "permissions"} onClick={() => setActiveTab("permissions")} icon={<path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />} label={t("company_settings.nav.roles", "Roles")} fullLabel={t("company_settings.nav.roles_full", "Roles y Permisos")} />
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-reply-bg dark:bg-reply-bg-dark">
          <div className="flex-1 overflow-y-auto p-4 md:p-8 relative scroll-smooth">
            <div className="max-w-4xl mx-auto pb-10">
              {renderTabContent()}

              {activeTab === "billing" && (
                <div className="space-y-6 animate-fadeIn">
                  {/* Plan Overview */}
                  <div className="bg-white dark:bg-reply-panel-dark p-8 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm text-center relative overflow-hidden">
                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between">
                      <div className="text-left mb-6 md:mb-0">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-3 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg text-2xl">[VIP]</div>
                          <div>
                            <h3 className="text-2xl font-bold text-gray-800 dark:text-white leading-tight">
                              {settings.billing.plan?.name || t("company_settings.billing.free_plan", "Plan Gratuito")}
                            </h3>
                            <div className="flex items-baseline gap-1">
                              <span className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">${settings.billing.plan?.price || 0}</span>
                              <span className="text-gray-500 font-medium">{t("company_settings.billing.per_month", "/mes")}</span>
                            </div>
                          </div>
                        </div>
                        <p className="text-gray-500 text-sm flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                          {t("company_settings.billing.renewal", "Renovación:")}{" "}
                          <span className="font-bold text-gray-800 dark:text-gray-200">
                            {settings.billing.subscriptionEndsAt
                              ? new Date(settings.billing.subscriptionEndsAt).toLocaleDateString(t("common.locale_code", "es-CO"), { year: "numeric", month: "long", day: "numeric" })
                              : t("company_settings.billing.monthly", "Mensual")}
                          </span>
                        </p>
                      </div>
                      {/* Stripe Promo */}
                      <div className="bg-gradient-to-r from-[#635BFF] to-[#635BFF]/80 p-5 rounded-xl text-white shadow-lg max-w-sm w-full">
                        <span className="font-bold text-lg flex items-center gap-2">Stripe <span className="text-[10px] bg-white text-[#635BFF] px-1.5 py-0.5 rounded uppercase tracking-wider font-extrabold">{t("common.soon", "PRONTO")}</span></span>
                        <p className="text-white/90 text-sm leading-relaxed my-3">{t("company_settings.billing.stripe_promo.desc", "Pronto podrás vincular tu tarjeta para pagos automáticos.")}</p>
                        <button className="w-full py-2 bg-white text-[#635BFF] rounded-lg font-bold text-sm cursor-not-allowed opacity-80" disabled>{t("company_settings.billing.stripe_promo.notify", "Notificarme cuando esté listo")}</button>
                      </div>
                    </div>
                  </div>

                  {/* Resource Usage */}
                  {planData && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="bg-white dark:bg-reply-panel-dark p-6 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm">
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-6">{t("company_settings.billing.usage_title", "Consumo de Recursos")}</h4>
                        <div className="space-y-6">
                          {[
                            { label: t("company_settings.billing.resources.users", "Usuarios / Agentes"), current: planData.usage.users, max: planData.plan.limits.max_users, percent: planData.percentages.users },
                            { label: t("company_settings.billing.resources.whatsapp", "Conexiones WhatsApp"), current: planData.usage.whatsapp_sessions, max: planData.plan.limits.max_whatsapp_sessions, percent: planData.percentages.whatsapp_sessions },
                            { label: t("company_settings.billing.resources.contacts", "Contactos (CRM)"), current: planData.usage.contacts, max: planData.plan.limits.max_contacts, percent: planData.percentages.contacts },
                            { label: t("company_settings.billing.resources.workflows", "Workflows Activos"), current: planData.usage.workflows, max: planData.plan.limits.max_workflows, percent: planData.percentages.workflows },
                          ].map((item, i) => (
                            <div key={i}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-600 dark:text-gray-400 font-medium">{item.label}</span>
                                <span className="font-bold text-gray-800 dark:text-white">{item.current}<span className="text-gray-400 font-normal mx-1">/</span>{!item.max || item.max === -1 ? "∞" : item.max}</span>
                              </div>
                              <div className="w-full bg-gray-100 dark:bg-gray-700/50 rounded-full h-2.5 overflow-hidden">
                                <div className={`h-2.5 rounded-full transition-all duration-500 ${(item.percent || 0) > 90 ? "bg-red-500" : (item.percent || 0) > 75 ? "bg-yellow-500" : "bg-indigo-600"}`} style={{ width: `${Math.min(item.percent || 0, 100)}%` }}></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-white dark:bg-reply-panel-dark p-6 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm h-full">
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-6">{t("company_settings.billing.scope_title", "Alcance del Plan")}</h4>
                        <div className="space-y-3">
                          {[
                            { name: t("company_settings.billing.features.ai", "Motor de Inteligencia Artificial"), enabled: (planData.plan.limits.max_ai_assistants || 0) > 0 },
                            { name: t("company_settings.billing.features.api", "API Access & Webhooks"), enabled: true },
                            { name: t("company_settings.billing.features.white_label", "Marca Blanca (White Label)"), enabled: true },
                            { name: t("company_settings.billing.features.support", "Soporte Prioritario"), enabled: true },
                            { name: t("company_settings.billing.features.reports", "Reportes Avanzados"), enabled: true },
                          ].map((feature, i) => (
                            <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${feature.enabled ? "bg-reply-bg dark:bg-gray-800/30 border-gray-100 dark:border-reply-border-dark" : "bg-reply-bg opacity-50 border-transparent"}`}>
                              <span className="font-medium text-gray-700 dark:text-gray-300">{feature.name}</span>
                              {feature.enabled ? (
                                <span className="text-xs font-bold text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-2.5 py-1 rounded-full">✓ {t("company_settings.billing.included", "Incluido")}</span>
                              ) : (
                                <span className="text-xs font-bold text-gray-500 bg-gray-200 px-2 py-1 rounded-full">{t("company_settings.billing.not_included", "No incluido")}</span>
                              )}
                            </div>
                          ))}
                          <div className="mt-6 pt-4 border-t border-gray-100 dark:border-reply-border-dark text-center">
                            <p className="text-xs text-gray-500 mb-2">{t("company_settings.billing.need_more", "¿Necesitas más capacidad?")}</p>
                            <button className="text-indigo-600 dark:text-indigo-400 font-bold text-sm hover:underline">{t("company_settings.billing.contact_sales", "Contactar Ventas")}</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Payment Methods */}
                  <div id="payment-methods" className="bg-reply-bg dark:bg-reply-surface-dark p-6 rounded-xl border border-gray-200 dark:border-reply-border-dark text-left">
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center justify-between">
                      {t("company_settings.billing.manual_payments", "Métodos de Pago Manuales")}
                      <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded font-bold">{t("company_settings.billing.temporal", "TEMPORAL")}</span>
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white dark:bg-reply-panel-dark p-4 rounded-lg border border-gray-100 dark:border-reply-border-dark shadow-sm">
                        <h5 className="font-bold text-[#E90772] mb-1 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#E90772]"></span> Nequi</h5>
                        <p className="font-mono text-lg text-gray-800 dark:text-white tracking-wide">322 901 2685</p>
                      </div>
                      <div className="bg-white dark:bg-reply-panel-dark p-4 rounded-lg border border-gray-100 dark:border-reply-border-dark shadow-sm">
                        <h5 className="font-bold text-[#FF0000] mb-1 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#FF0000]"></span> Daviplata</h5>
                        <p className="font-mono text-lg text-gray-800 dark:text-white tracking-wide">324 245 0628</p>
                      </div>
                      <div className="bg-white dark:bg-reply-panel-dark p-4 rounded-lg border border-gray-100 dark:border-reply-border-dark shadow-sm">
                        <h5 className="font-bold text-purple-600 mb-1 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-purple-600"></span> Bre-B</h5>
                        <p className="font-mono text-lg text-gray-800 dark:text-white tracking-wide">324 245 0628</p>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600 text-xs text-center text-gray-500">
                      {t("company_settings.billing.manual_desc", "Envía tu comprobante a soporte para activar tu renovación inmediatamente.")}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Fixed Footer Bar */}
          <div className="bg-white/80 dark:bg-reply-surface-dark/80 backdrop-blur-md p-4 md:p-5 border-t border-gray-200 dark:border-reply-border-dark flex justify-center md:justify-end items-center shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-20 sticky bottom-0">
            <button
              onClick={handleSave}
              disabled={loading}
              className="w-full md:w-auto bg-indigo-600 text-white px-10 py-3 rounded-2xl font-bold shadow-xl shadow-indigo-500/30 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-3 text-sm md:text-base group"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <svg className="w-5 h-5 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{t("company_settings.save_button", "Guardar Cambios")}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      <AvatarPickerModal />
    </div>
  );
};
