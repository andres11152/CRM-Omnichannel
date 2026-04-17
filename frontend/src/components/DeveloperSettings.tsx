import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/axios";
import { WebhookEndpoint, WebhookEventType } from "@/types";
import { ModuleHeader } from "./common/ModuleHeader";
import {
  Clipboard,
  ShieldCheck,
  Activity,
  CheckCircle,
  XCircle,
  Code,
} from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

export const DeveloperSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"webhooks" | "api-keys" | "api-docs">(
    "webhooks",
  );
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);

  // Webhook States
  const [isCreatingWebhook, setIsCreatingWebhook] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<WebhookEventType[]>([]);
  const [visibleSecrets, setVisibleSecrets] = useState<string[]>([]);

  // New States for Enhanced DX
  const [logs, setLogs] = useState<
    Array<{
      id: string;
      status: number;
      eventType: string;
      url: string;
      timestamp: string;
      duration: number;
    }>
  >([]);
  const [globalSecret, setGlobalSecret] = useState("");

  // API Key States
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  // Load Data
  useEffect(() => {
    fetchWebhooks();
    fetchApiKeys();

    // Fetch Secret & Logs
    api
      .get("/webhooks/secret")
      .then((res) => setGlobalSecret(res.data?.data?.secret || ""))
      .catch(console.error);
    api
      .get("/webhooks/logs")
      .then((res) => setLogs(res.data?.data || []))
      .catch(console.error);
  }, []);

  const fetchWebhooks = async () => {
    try {
      const res = await api.get("/webhooks");
      // Ensure we always have an array
      const data = res.data.data || res.data;
      setWebhooks(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching webhooks", error);
    }
  };

  const fetchApiKeys = async () => {
    try {
      const res = await api.get("/api-keys");
      const data = res.data.data || res.data;
      setApiKeys(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching keys", error);
    }
  };

  // --- WEBHOOK ACTIONS ---

  // --- WEBHOOK ACTIONS ---

  const handleCreateWebhook = async () => {
    if (!newUrl) return;
    try {
      await api.post("/webhooks", {
        url: newUrl,
        description: newDesc || "Sin descripción",
        events:
          selectedEvents.length > 0 ? selectedEvents : ["message.received"],
      });

      await fetchWebhooks();
      setIsCreatingWebhook(false);
      setNewDesc("");
      setSelectedEvents([]);
      toast.success("Webhook creado correctamente");
    } catch (error) {
      toast.error("Error al crear el webhook");
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!confirm("¿Ests seguro de eliminar este webhook?")) return;
    try {
      await api.delete(`/webhooks/${id}`);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleWebhook = async (id: string) => {
    try {
      await api.patch(`/webhooks/${id}/toggle`);
      setWebhooks((prev) =>
        prev.map((w) => (w.id === id ? { ...w, isActive: !w.isActive } : w)),
      );
    } catch (e) {
      console.error(e);
    }
  };

  const toggleSecret = (id: string) => {
    setVisibleSecrets((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const toggleEvent = (evt: WebhookEventType) => {
    setSelectedEvents((prev) =>
      prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt],
    );
  };

  // --- API KEY ACTIONS ---

  // --- API KEY ACTIONS ---

  const handleCreateApiKey = async () => {
    try {
      const res = await api.post("/api-keys", {
        name: newKeyName || "API Key",
      });
      const data = res.data;
      setGeneratedKey(data.secretKey || data.data?.secretKey);
      await fetchApiKeys();
      setIsCreatingKey(false);
      setNewKeyName("");
    } catch (e) {
      toast.error("Error al crear API Key");
    }
  };

  const handleDeleteApiKey = async (id: string) => {
    if (
      !confirm(
        "¿Revocar esta clave API? Las integraciones que la usen dejarn de funcionar.",
      )
    )
      return;
    try {
      await api.delete(`/api-keys/${id}`);
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const availableEvents: WebhookEventType[] = [
    "message.received",
    "message.sent",
    "ticket.created",
    "ticket.status_changed",
    "ticket.assigned",
    "contact.created",
    "contact.updated",
    "deal.created",
    "deal.stage_changed",
    "deal.won",
    "deal.lost",
    "campaign.completed",
    "session.connected",
    "session.disconnected",
  ];

  return (
    <div className="h-full flex flex-col bg-white dark:bg-reply-panel-dark rounded-lg shadow-sm border border-gray-200 dark:border-reply-border-dark transition-colors duration-200">
      <ModuleHeader
        title="Developer API & Webhooks"
        description="Herramientas para desarrolladores: Webhooks para eventos en tiempo real y API Keys para acceso programtico."
        icon={
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
            />
          </svg>
        }
        gradient="from-gray-600 to-zinc-600 dark:from-gray-800 dark:to-zinc-800"
        stats={{
          label: activeTab === "webhooks" ? "Webhooks Activos" : "Keys Activas",
          value:
            activeTab === "webhooks"
              ? (webhooks || []).filter((w) => w.isActive).length
              : (apiKeys || []).length,
        }}
        action={
          <div className="flex bg-black/20 rounded-xl p-1 backdrop-blur-sm border border-white/10 shrink-0">
            <button
              onClick={() => setActiveTab("webhooks")}
              className={`px-3 md:px-5 py-1.5 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center gap-2 ${activeTab === "webhooks" ? "bg-white text-gray-900 shadow-lg" : "text-white/70 hover:text-white"}`}
            >
              <Activity className="w-3.5 h-3.5" />
              Webhooks
            </button>
            <button
              onClick={() => setActiveTab("api-keys")}
              className={`px-3 md:px-5 py-1.5 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center gap-2 ${activeTab === "api-keys" ? "bg-white text-gray-900 shadow-lg" : "text-white/70 hover:text-white"}`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              API Keys
            </button>
            <button
              onClick={() => setActiveTab("api-docs")}
              className={`px-3 md:px-5 py-1.5 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center gap-2 ${activeTab === "api-docs" ? "bg-white text-gray-900 shadow-lg" : "text-white/70 hover:text-white"}`}
            >
              <Code className="w-3.5 h-3.5" />
              API Docs
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto bg-reply-bg dark:bg-reply-bg-dark p-4 md:p-8">
        <div className="max-w-5xl mx-auto space-y-8 pb-12">
          {/* --- WEBHOOKS TAB --- */}
          {activeTab === "webhooks" && (
            <div className="animate-in fade-in duration-500 space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-reply-panel-dark p-5 rounded-2xl border border-gray-200 dark:border-reply-border-dark shadow-sm">
                <div>
                  <h3 className="font-bold text-gray-800 dark:text-white text-lg flex items-center gap-2">
                    Endpoints Configurados
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                      {webhooks.length}
                    </span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Configura URLs externas donde Reply enviar eventos en tiempo
                    real.
                  </p>
                </div>
                <button
                  onClick={() => setIsCreatingWebhook(!isCreatingWebhook)}
                  className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${isCreatingWebhook ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" : "bg-indigo-600 text-white shadow-indigo-500/20 hover:bg-indigo-700 active:scale-95"}`}
                >
                  {isCreatingWebhook ? (
                    <>
                      <span>Cerrar</span>
                    </>
                  ) : (
                    <>
                      <Activity className="w-4 h-4" />{" "}
                      <span>Nuevo Webhook</span>
                    </>
                  )}
                </button>
              </div>

              {isCreatingWebhook && (
                <div className="bg-white dark:bg-reply-panel-dark p-6 rounded-2xl border border-indigo-200 dark:border-indigo-900/50 shadow-xl space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Endpoint URL (POST)
                      </label>
                      <input
                        type="url"
                        value={newUrl}
                        onChange={(e) => setNewUrl(e.target.value)}
                        placeholder="https://api.empresa.com/webhook"
                        className="w-full bg-reply-bg dark:bg-black/20 border border-gray-200 dark:border-reply-border-dark rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Descripción
                      </label>
                      <input
                        type="text"
                        value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                        placeholder="Ej: Integración con ERP Interno"
                        className="w-full bg-reply-bg dark:bg-black/20 border border-gray-200 dark:border-reply-border-dark rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                      Eventos a Suscribir
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {availableEvents.map((evt) => (
                        <button
                          key={evt}
                          onClick={() => toggleEvent(evt)}
                          className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all ${
                            selectedEvents.includes(evt)
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-reply-border-dark hover:border-indigo-400"
                          }`}
                        >
                          {evt.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={handleCreateWebhook}
                      className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold text-sm hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
                    >
                      Guardar Configuración
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4">
                {webhooks.length === 0 && !isCreatingWebhook && (
                  <div className="text-center py-20 bg-white dark:bg-reply-panel-dark rounded-2xl border border-dashed border-gray-200 dark:border-reply-border-dark">
                    <div className="w-16 h-16 bg-reply-bg dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4 text-gray-300">
                      <Activity className="w-8 h-8" />
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 font-medium">
                      No hay webhooks configurados aún.
                    </p>
                  </div>
                )}
                {webhooks.map((wh) => (
                  <div
                    key={wh.id}
                    className="bg-white dark:bg-reply-panel-dark border border-gray-200 dark:border-reply-border-dark rounded-2xl p-5 md:p-6 hover:shadow-md transition-all group overflow-hidden relative"
                  >
                    <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-2 h-2 rounded-full ${wh.isActive ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-gray-400"}`}
                          ></div>
                          <h4 className="font-bold text-gray-800 dark:text-white font-mono text-sm break-all">
                            {wh.url}
                          </h4>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 pl-5">
                          {wh.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 w-full md:w-auto justify-end border-t md:border-t-0 pt-3 md:pt-0 border-gray-50 dark:border-reply-border-dark">
                        <button
                          onClick={() => handleToggleWebhook(wh.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${wh.isActive ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                        >
                          {wh.isActive ? "DESACTIVAR" : "ACTIVAR"}
                        </button>
                        <button
                          onClick={() => handleDeleteWebhook(wh.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <XCircle className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 bg-reply-bg dark:bg-black/10 p-4 rounded-xl border border-gray-100 dark:border-reply-border-dark">
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase mb-2 block tracking-widest">
                          Eventos Suscritos
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {wh.events.map((evt) => (
                            <span
                              key={evt}
                              className="bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-md text-[10px] font-bold border border-gray-200 dark:border-reply-border-dark shadow-sm"
                            >
                              {evt.toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase mb-2 block tracking-widest">
                          Signing Secret (HMAC)
                        </span>
                        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-reply-border-dark rounded-lg px-3 py-2 font-mono text-xs shadow-sm">
                          <span className="flex-1 truncate dark:text-gray-300">
                            {visibleSecrets.includes(wh.id)
                              ? wh.secret
                              : "•".repeat(24)}
                          </span>
                          <button
                            onClick={() => toggleSecret(wh.id)}
                            className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          >
                            {visibleSecrets.includes(wh.id) ? (
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268-2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                                />
                              </svg>
                            ) : (
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(wh.secret);
                              toast.success("Secret copiado!");
                            }}
                            className="text-gray-400 hover:text-indigo-600"
                          >
                            <Clipboard className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* DELIVERY LOGS SECTION */}
              <div className="mt-12 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-800 dark:text-white text-lg flex items-center gap-2">
                    <Activity className="w-5 h-5 text-indigo-500" />
                    Logs de Entrega Recientes
                  </h3>
                  <button
                    onClick={() => {
                      // In theory a refresh would be nice
                      toast.info("Actualizando logs...");
                    }}
                    className="text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:underline"
                  >
                    ACTUALIZAR
                  </button>
                </div>

                {/* DESKTOP VIEW */}
                <div className="hidden lg:block bg-white dark:bg-reply-panel-dark rounded-2xl border border-gray-200 dark:border-reply-border-dark overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-reply-bg dark:bg-gray-800/50 text-[10px] uppercase tracking-widest font-bold text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-reply-border-dark">
                      <tr>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Evento</th>
                        <th className="px-6 py-4">URL Destino</th>
                        <th className="px-6 py-4">Fecha/Hora</th>
                        <th className="px-6 py-4 text-right">Latencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                      {logs.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-6 py-12 text-center text-gray-400 italic"
                          >
                            No hay actividad reciente.
                          </td>
                        </tr>
                      ) : (
                        logs.map((log) => (
                          <tr
                            key={log.id}
                            className="hover:bg-reply-bg dark:hover:bg-white/5 transition-colors group"
                          >
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${log.status >= 200 && log.status < 300 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}
                              >
                                {log.status >= 200 && log.status < 300 ? (
                                  <CheckCircle className="w-3.5 h-3.5" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5" />
                                )}{" "}
                                {log.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-mono text-[11px] font-bold text-gray-600 dark:text-gray-300">
                              {log.eventType}
                            </td>
                            <td
                              className="px-6 py-4 text-gray-500 dark:text-gray-400 truncate max-w-[250px] font-mono text-xs"
                              title={log.url}
                            >
                              {log.url}
                            </td>
                            <td className="px-6 py-4 text-gray-400 text-xs">
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-right font-mono text-[11px] font-bold text-indigo-500">
                              {log.duration}ms
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* MOBILE VIEW */}
                <div className="lg:hidden space-y-3">
                  {logs.length === 0 ? (
                    <div className="text-center py-10 text-gray-400 italic text-sm">
                      No hay actividad reciente.
                    </div>
                  ) : (
                    logs.map((log) => (
                      <div
                        key={log.id}
                        className="bg-white dark:bg-reply-panel-dark p-4 rounded-xl border border-gray-100 dark:border-reply-border-dark shadow-sm space-y-3"
                      >
                        <div className="flex justify-between items-start">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${log.status >= 200 && log.status < 300 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}
                          >
                            {log.status >= 200 && log.status < 300 ? (
                              <CheckCircle className="w-3.5 h-3.5" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5" />
                            )}{" "}
                            {log.status}
                          </span>
                          <span className="text-[11px] font-bold text-indigo-500 font-mono">
                            {log.duration}ms
                          </span>
                        </div>
                        <div className="space-y-1">
                          <p className="font-mono text-[11px] font-bold text-gray-700 dark:text-gray-200">
                            {log.eventType}
                          </p>
                          <p className="text-[10px] text-gray-400 break-all font-mono">
                            {log.url}
                          </p>
                        </div>
                        <div className="text-[10px] text-gray-400 pt-2 border-t border-gray-50 dark:border-reply-border-dark flex justify-between">
                          <span>TIMESTAMPS</span>
                          <span>
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* --- API KEYS TAB --- */}
          {activeTab === "api-keys" && (
            <div className="animate-in fade-in duration-500 space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-reply-panel-dark p-5 rounded-2xl border border-gray-200 dark:border-reply-border-dark shadow-sm">
                <div>
                  <h3 className="font-bold text-gray-800 dark:text-white text-lg flex items-center gap-2">
                    Claves API Activas
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                      {apiKeys.length}
                    </span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Usa estas claves para autenticar peticiones directas desde
                    tus scripts o backends.
                  </p>
                </div>
                <button
                  onClick={() => setIsCreatingKey(!isCreatingKey)}
                  className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${isCreatingKey ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" : "bg-indigo-600 text-white shadow-indigo-500/20 hover:bg-indigo-700 active:scale-95"}`}
                >
                  {isCreatingKey ? (
                    <>
                      <span>Cerrar</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />{" "}
                      <span>Nueva API Key</span>
                    </>
                  )}
                </button>
              </div>

              {generatedKey && (
                <div className="bg-emerald-50 dark:bg-emerald-900/10 border-2 border-emerald-200 dark:border-emerald-800/50 p-6 rounded-2xl mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="flex items-start gap-4">
                    <div className="bg-emerald-100 dark:bg-emerald-800 p-3 rounded-2xl text-emerald-600 dark:text-emerald-300 shadow-sm">
                      <CheckCircle className="w-6 h-6" />
                    </div>
                    <div className="flex-1 space-y-4">
                      <div>
                        <h4 className="font-bold text-emerald-800 dark:text-emerald-300 text-lg">
                          ¡API Key Generada!
                        </h4>
                        <p className="text-emerald-700 dark:text-emerald-400/80 text-xs font-medium">
                          Copia esta clave inmediatamente. Por seguridad, no
                          volver a mostrarse.
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <div className="flex-1 bg-white dark:bg-black/40 px-4 py-3 rounded-xl border border-emerald-100 dark:border-emerald-900 shadow-inner font-mono text-xs break-all text-gray-800 dark:text-gray-200 select-all">
                          {generatedKey}
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(generatedKey);
                            toast.success("Copiado!", {
                              position: "bottom-center",
                            });
                          }}
                          className="bg-emerald-600 text-white px-6 py-3 rounded-xl hover:bg-emerald-700 text-sm font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                          <Clipboard className="w-4 h-4" /> Copiar
                        </button>
                      </div>

                      <button
                        onClick={() => setGeneratedKey(null)}
                        className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline uppercase tracking-widest"
                      >
                        YA LA HE GUARDADO, CONTINUAR
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {isCreatingKey && !generatedKey && (
                <div className="bg-white dark:bg-reply-panel-dark p-6 rounded-xl border border-indigo-100 dark:border-indigo-900 shadow-md mb-8 animate-fade-in">
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Nombre de la Clave
                    </label>
                    <input
                      type="text"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="Ej: Servidor de Producción"
                      className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-border-dark text-gray-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleCreateApiKey}
                      className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold text-sm hover:bg-indigo-700 shadow-sm"
                    >
                      Generar Clave
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4">
                {apiKeys.length === 0 && !isCreatingKey && (
                  <div className="text-center py-20 bg-white dark:bg-reply-panel-dark rounded-2xl border border-dashed border-gray-200 dark:border-reply-border-dark">
                    <div className="w-16 h-16 bg-reply-bg dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4 text-gray-300">
                      <ShieldCheck className="w-8 h-8" />
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 font-medium">
                      No hay claves API generadas aún.
                    </p>
                  </div>
                )}
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="bg-white dark:bg-reply-panel-dark border border-gray-200 dark:border-reply-border-dark rounded-2xl p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/10 rounded-xl flex items-center justify-center text-indigo-500">
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800 dark:text-white mb-0.5">
                          {key.name}
                        </h4>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded uppercase tracking-widest">
                            {key.keyPrefix}
                          </span>
                          <span className="text-[10px] text-gray-400 uppercase font-bold tracking-tight">
                            Creada el{" "}
                            {new Date(key.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end border-t md:border-t-0 pt-3 md:pt-0 border-gray-50 dark:border-reply-border-dark">
                      <button
                        onClick={() => handleDeleteApiKey(key.id)}
                        className="w-full md:w-auto px-4 py-2 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors uppercase tracking-widest"
                      >
                        Revocar Acceso
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* --- API DOCS TAB --- */}
          {activeTab === "api-docs" && (
            <div className="animate-in fade-in duration-500 space-y-6">
              <div className="bg-white dark:bg-reply-panel-dark p-6 rounded-2xl border border-gray-200 dark:border-reply-border-dark shadow-sm">
                <div className="mb-6">
                  <h3 className="font-bold text-gray-800 dark:text-white text-xl flex items-center gap-2">
                    <Code className="w-6 h-6 text-indigo-500" />
                    Referencia de API REST
                  </h3>
                  <p className="text-sm text-gray-500 mt-2">
                    Integra Reply con tus sistemas internos. Autentícate enviando tu API Key en el header <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400">X-API-Key</code>.
                    Todas las peticiones deben usar el Content-Type <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400">application/json</code>. Base URL: <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400">https://api.tudominio.com/api/v1/external</code>
                  </p>
                </div>

                <div className="space-y-8">
                  {/* Endpoint 1: Mensajes */}
                  <div className="border border-gray-100 dark:border-reply-border-dark rounded-xl overflow-hidden">
                    <div className="bg-gray-50 dark:bg-gray-800/50 p-4 border-b border-gray-100 dark:border-reply-border-dark flex items-center gap-4">
                      <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-3 py-1 rounded-lg text-xs font-bold uppercase">POST</span>
                      <span className="font-mono text-sm text-gray-700 dark:text-gray-300 font-bold">/messages/send</span>
                      <span className="text-sm text-gray-500 ml-auto hidden sm:block">Enviar Mensaje WhatsApp</span>
                    </div>
                    <div className="p-4 bg-gray-900 text-gray-300 font-mono text-xs overflow-x-auto">
                      <pre>
{`curl -X POST https://api.tudominio.com/api/v1/external/messages/send \\
  -H "X-API-Key: tu_api_key_aqui" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "573001234567",
    "text": "Hola, este es un mensaje automtico desde la API de Reply."
  }'`}
                      </pre>
                    </div>
                  </div>

                  {/* Endpoint 2: Crear Contacto */}
                  <div className="border border-gray-100 dark:border-reply-border-dark rounded-xl overflow-hidden">
                    <div className="bg-gray-50 dark:bg-gray-800/50 p-4 border-b border-gray-100 dark:border-reply-border-dark flex items-center gap-4">
                      <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-3 py-1 rounded-lg text-xs font-bold uppercase">POST</span>
                      <span className="font-mono text-sm text-gray-700 dark:text-gray-300 font-bold">/contacts</span>
                      <span className="text-sm text-gray-500 ml-auto hidden sm:block">Crear o Actualizar Contacto</span>
                    </div>
                    <div className="p-4 bg-gray-900 text-gray-300 font-mono text-xs overflow-x-auto">
                      <pre>
{`curl -X POST https://api.tudominio.com/api/v1/external/contacts \\
  -H "X-API-Key: tu_api_key_aqui" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Juan Perez",
    "phone": "573001234567",
    "email": "juan@empresa.com",
    "tags": ["Cliente VIP", "API"]
  }'`}
                      </pre>
                    </div>
                  </div>

                  {/* Endpoint 3: Crear Deal */}
                  <div className="border border-gray-100 dark:border-reply-border-dark rounded-xl overflow-hidden">
                    <div className="bg-gray-50 dark:bg-gray-800/50 p-4 border-b border-gray-100 dark:border-reply-border-dark flex items-center gap-4">
                      <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-3 py-1 rounded-lg text-xs font-bold uppercase">POST</span>
                      <span className="font-mono text-sm text-gray-700 dark:text-gray-300 font-bold">/deals</span>
                      <span className="text-sm text-gray-500 ml-auto hidden sm:block">Crear Oportunidad (Deal)</span>
                    </div>
                    <div className="p-4 bg-gray-900 text-gray-300 font-mono text-xs overflow-x-auto">
                      <pre>
{`curl -X POST https://api.tudominio.com/api/v1/external/deals \\
  -H "X-API-Key: tu_api_key_aqui" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Renovación 2025",
    "value": 15000,
    "currency": "USD",
    "pipelineId": "cuid_pipeline_123",
    "stageId": "cuid_stage_123"
  }'`}
                      </pre>
                    </div>
                  </div>
                  
                  {/* Endpoint 4: Listar Tickets */}
                  <div className="border border-gray-100 dark:border-reply-border-dark rounded-xl overflow-hidden">
                    <div className="bg-gray-50 dark:bg-gray-800/50 p-4 border-b border-gray-100 dark:border-reply-border-dark flex items-center gap-4">
                      <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-3 py-1 rounded-lg text-xs font-bold uppercase">GET</span>
                      <span className="font-mono text-sm text-gray-700 dark:text-gray-300 font-bold">/tickets</span>
                      <span className="text-sm text-gray-500 ml-auto hidden sm:block">Listar Tickets</span>
                    </div>
                    <div className="p-4 bg-gray-900 text-gray-300 font-mono text-xs overflow-x-auto">
                      <pre>
{`curl -X GET https://api.tudominio.com/api/v1/external/tickets \\
  -H "X-API-Key: tu_api_key_aqui"`}
                      </pre>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
