import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "@/services/apiConfig";

interface InstagramSession {
  id: string;
  status: string;
  username: string | null;
  igBusinessAccountId: string;
  createdAt: string;
}

export const InstagramTab: React.FC = () => {
  const { t } = useTranslation();
  const [instagramSessions, setInstagramSessions] = useState<InstagramSession[]>([]);
  const [isConnectingInstagram, setIsConnectingInstagram] = useState(false);
  const [igAccessToken, setIgAccessToken] = useState("");
  const [igBusinessAccountId, setIgBusinessAccountId] = useState("");
  const [igPageId, setIgPageId] = useState("");
  const [igUsername, setIgUsername] = useState("");
  const [igVerifyToken, setIgVerifyToken] = useState("");
  const [loadingInstagram, setLoadingInstagram] = useState(false);

  const fetchInstagramSessions = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/instagram/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status === "success") {
        setInstagramSessions(data.data.sessions);
      }
    } catch (error) {
      console.error("Failed to fetch Instagram sessions", error);
    }
  };

  useEffect(() => {
    fetchInstagramSessions();
  }, []);

  const openInstagramModal = () => {
    setIgVerifyToken("reply_verify_" + Math.random().toString(36).substring(5));
    setIgAccessToken("");
    setIgBusinessAccountId("");
    setIgPageId("");
    setIgUsername("");
    setIsConnectingInstagram(true);
  };

  const handleCreateInstagramSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingInstagram(true);
    const toastId = toast.loading(t("integrations.instagram.linking", "Vinculando cuenta de Instagram..."));
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/instagram/sessions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accessToken: igAccessToken,
          igBusinessAccountId,
          pageId: igPageId,
          verifyToken: igVerifyToken,
          username: igUsername || undefined,
        }),
      });
      const data = await res.json();
      if (res.status === 201 && data.status === "success") {
        toast.success(t("integrations.instagram.linked_success", "Cuenta de Instagram vinculada exitosamente"), { id: toastId });
        setIsConnectingInstagram(false);
        fetchInstagramSessions();
      } else {
        toast.error(data.message || t("integrations.instagram.error.failed", "Error al vincular Instagram"), { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error(t("integrations.instagram.error.connection", "Error de conexión al vincular Instagram"), { id: toastId });
    } finally {
      setLoadingInstagram(false);
    }
  };

  const handleDeleteInstagramSession = async (id: string) => {
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_BASE_URL}/instagram/sessions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success(t("integrations.instagram.disconnected_success", "Cuenta de Instagram desconectada"));
      fetchInstagramSessions();
    } catch (error) {
      console.error("Failed to delete Instagram session", error);
      toast.error(t("integrations.instagram.error.disconnect", "No se pudo desconectar la cuenta de Instagram"));
    }
  };

  return (
    <section className="bg-white dark:bg-reply-panel-dark rounded-2xl border border-gray-200 dark:border-reply-border-dark shadow-sm p-6 md:p-8">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 rounded-lg bg-reply-bg dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="url(#section-ig-grad)">
            <defs>
              <linearGradient id="section-ig-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop stopColor="#833AB4" offset="0%" />
                <stop stopColor="#FD1D1D" offset="50%" />
                <stop stopColor="#FCB045" offset="100%" />
              </linearGradient>
            </defs>
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.163 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">{t("navigation.integrations")} - Instagram</h2>
            <span className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400 text-[11px] font-bold border border-pink-200 dark:border-pink-800">
              {instagramSessions.length} {instagramSessions.length === 1 ? t("integrations.instagram.one_account", "cuenta") : t("integrations.instagram.many_accounts", "cuentas")}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t("integrations.instagram.description", "Cuentas profesionales de Instagram conectadas vía Graph API.")}
          </p>
        </div>
      </div>

      <div className="h-px bg-gray-100 dark:bg-reply-border-dark my-6" />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {instagramSessions.map((session) => (
          <div
            key={session.id}
            className="group bg-white dark:bg-reply-panel-dark rounded-2xl border border-gray-200 dark:border-reply-border-dark shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden"
          >
            <div
              className={`absolute top-0 left-0 w-full h-1 ${
                session.status === "CONNECTED"
                  ? "bg-gradient-to-r from-green-400 to-green-600"
                  : "bg-gradient-to-r from-red-400 to-red-600"
              }`}
            ></div>
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-xl bg-reply-bg dark:bg-gray-800 flex items-center justify-center">
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill={`url(#ig-grad-${session.id})`}>
                    <defs>
                      <linearGradient id={`ig-grad-${session.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop stopColor="#833AB4" offset="0%" />
                        <stop stopColor="#FD1D1D" offset="50%" />
                        <stop stopColor="#FCB045" offset="100%" />
                      </linearGradient>
                    </defs>
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.163 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                </div>
                <div className="px-2.5 py-1 rounded-full bg-reply-bg dark:bg-gray-800 border border-gray-100 dark:border-reply-border-dark flex items-center gap-2 shadow-sm">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      session.status === "CONNECTED"
                        ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                        : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                    }`}
                  ></div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {session.status === "CONNECTED" ? t("integrations.instagram.status.connected", "Conectado") : t("integrations.instagram.status.disconnected", "Desconectado")}
                  </span>
                </div>
              </div>

              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Instagram DM</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-mono mb-4 truncate">
                {session.username ? `@${session.username}` : session.igBusinessAccountId}
              </p>

              <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-reply-border-dark">
                <button
                  onClick={() => handleDeleteInstagramSession(session.id)}
                  className="flex-1 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-transparent hover:border-red-100 dark:hover:border-red-900/30"
                >
                  {t("common.disconnect", "Desconectar")}
                </button>
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={openInstagramModal}
          className="group flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-gray-200 dark:border-reply-border-dark hover:border-pink-400 dark:hover:border-pink-500/50 bg-reply-bg/50 dark:bg-reply-surface-dark hover:bg-pink-50/50 dark:hover:bg-pink-900/10 transition-all duration-300 h-full min-h-[180px]"
        >
          <div className="w-14 h-14 rounded-full bg-white dark:bg-gray-800 shadow-sm group-hover:shadow-md group-hover:scale-110 transition-all duration-300 flex items-center justify-center mb-4 text-pink-500">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h3 className="text-gray-900 dark:text-white font-bold group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">
            {t("integrations.instagram.connect_title", "Conectar Instagram")}
          </h3>
          <p className="text-sm text-gray-500 text-center mt-1">
            {t("integrations.instagram.connect_desc", "Vincula una cuenta profesional de Instagram")}
          </p>
        </button>
      </div>

      {isConnectingInstagram && (
        <div className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl w-full max-w-xl p-6 sm:p-8 border border-gray-100 dark:border-gray-800 relative">
            <button
              onClick={() => setIsConnectingInstagram(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t("integrations.instagram.connect_title", "Conectar Instagram")}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              {t("integrations.instagram.modal.description", "Ingresa los detalles de tu cuenta profesional de Instagram para vincularla a Sentry CRM.")}
            </p>

            <form onSubmit={handleCreateInstagramSession} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  {t("integrations.instagram.modal.access_token", "Access Token (Meta Graph API)")}
                </label>
                <input
                  type="password"
                  value={igAccessToken}
                  onChange={(e) => setIgAccessToken(e.target.value)}
                  placeholder="EAA..."
                  className="w-full px-4 py-3 bg-reply-bg dark:bg-gray-800 border border-gray-200 dark:border-reply-border-dark rounded-xl focus:ring-2 focus:ring-pink-500 outline-none text-xs font-mono text-gray-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Instagram Business Account ID
                  </label>
                  <input
                    type="text"
                    value={igBusinessAccountId}
                    onChange={(e) => setIgBusinessAccountId(e.target.value)}
                    placeholder="1784..."
                    className="w-full px-4 py-3 bg-reply-bg dark:bg-gray-800 border border-gray-200 dark:border-reply-border-dark rounded-xl focus:ring-2 focus:ring-pink-500 outline-none text-xs text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Facebook Page ID
                  </label>
                  <input
                    type="text"
                    value={igPageId}
                    onChange={(e) => setIgPageId(e.target.value)}
                    placeholder="1021..."
                    className="w-full px-4 py-3 bg-reply-bg dark:bg-gray-800 border border-gray-200 dark:border-reply-border-dark rounded-xl focus:ring-2 focus:ring-pink-500 outline-none text-xs text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    {t("integrations.instagram.modal.username", "Username (Opcional)")}
                  </label>
                  <input
                    type="text"
                    value={igUsername}
                    onChange={(e) => setIgUsername(e.target.value)}
                    placeholder="skycode.agency"
                    className="w-full px-4 py-3 bg-reply-bg dark:bg-gray-800 border border-gray-200 dark:border-reply-border-dark rounded-xl focus:ring-2 focus:ring-pink-500 outline-none text-xs text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    {t("integrations.instagram.modal.verify_token", "Verify Token (Para Webhook)")}
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={igVerifyToken}
                    className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-reply-border-dark rounded-xl outline-none text-xs font-mono text-gray-500 select-all"
                  />
                </div>
              </div>
              <div className="bg-reply-bg dark:bg-gray-800/80 p-3 rounded-xl border border-gray-200/50 dark:border-reply-border-dark text-[11px] text-gray-500">
                <span className="font-bold block mb-1">{t("integrations.instagram.modal.webhook_config", "Configuración del Webhook:")}</span>
                {t("integrations.instagram.modal.webhook_url", "URL del Webhook de Instagram:")} <code className="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-[10px] break-all">{`${API_BASE_URL.replace("/api", "")}/instagram/webhook`}</code>
              </div>
              <button
                type="submit"
                disabled={loadingInstagram}
                className="w-full py-3 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl transition-all shadow-md active:scale-95 mt-2"
              >
                {loadingInstagram ? t("common.linking", "Vinculando...") : t("integrations.instagram.modal.save", "Guardar Configuración Instagram")}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
