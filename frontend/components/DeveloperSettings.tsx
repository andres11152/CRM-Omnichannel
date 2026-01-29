import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "../src/lib/axios";
import { WebhookEndpoint, WebhookEventType } from "../types";
import { ModuleHeader } from "./common/ModuleHeader";
import {
  Clipboard,
  ShieldCheck,
  Activity,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

export const DeveloperSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"webhooks" | "api-keys">(
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
  const [logs, setLogs] = useState<any[]>([]);
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
    if (!confirm("¿Estás seguro de eliminar este webhook?")) return;
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
        "¿Revocar esta clave API? Las integraciones que la usen dejarán de funcionar.",
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
  ];

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#202c33] rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 transition-colors duration-200">
      <ModuleHeader
        title="Developer API & Webhooks"
        description="Herramientas para desarrolladores: Webhooks para eventos en tiempo real y API Keys para acceso programático."
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
          <div className="flex bg-black/20 rounded-lg p-1 backdrop-blur-sm">
            <button
              onClick={() => setActiveTab("webhooks")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === "webhooks" ? "bg-white text-gray-900 shadow-sm" : "text-white/70 hover:text-white"}`}
            >
              Webhooks
            </button>
            <button
              onClick={() => setActiveTab("api-keys")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === "api-keys" ? "bg-white text-gray-900 shadow-sm" : "text-white/70 hover:text-white"}`}
            >
              API Keys
            </button>
          </div>
        }
      />

      <div className="p-8 flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0b141a]">
        {/* --- WEBHOOKS TAB --- */}
        {activeTab === "webhooks" && (
          <>
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-gray-700 dark:text-gray-300">
                Webhooks Configurados
              </h3>
              <button
                onClick={() => setIsCreatingWebhook(!isCreatingWebhook)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                {isCreatingWebhook ? "Cancelar" : "+ Nuevo Webhook"}
              </button>
            </div>

            {isCreatingWebhook && (
              <div className="bg-white dark:bg-[#202c33] p-6 rounded-xl border border-indigo-100 dark:border-indigo-900 shadow-md mb-8 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Endpoint URL (POST)
                    </label>
                    <input
                      type="text"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      placeholder="https://api.tu-servidor.com/webhook"
                      className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#2a3942] text-gray-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Descripción
                    </label>
                    <input
                      type="text"
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      placeholder="Ej: Integración con ERP"
                      className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#2a3942] text-gray-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Eventos a Suscribir
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availableEvents.map((evt) => (
                      <button
                        key={evt}
                        onClick={() => toggleEvent(evt)}
                        className={`px-3 py-1 rounded-full text-xs font-mono border transition-all ${
                          selectedEvents.includes(evt)
                            ? "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900 dark:text-indigo-300 dark:border-indigo-700"
                            : "bg-gray-50 dark:bg-[#111b21] text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-[#2a3942]"
                        }`}
                      >
                        {evt}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleCreateWebhook}
                    className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold text-sm hover:bg-indigo-700 shadow-sm"
                  >
                    Guardar Endpoint
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {webhooks.length === 0 && !isCreatingWebhook && (
                <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                  No hay webhooks configurados.
                </div>
              )}
              {webhooks.map((wh) => (
                <div
                  key={wh.id}
                  className="bg-white dark:bg-[#202c33] border border-gray-200 dark:border-gray-700 rounded-lg p-6 hover:shadow-sm transition-shadow"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <h4 className="font-bold text-gray-800 dark:text-white font-mono text-sm">
                          {wh.url}
                        </h4>
                        <button
                          onClick={() => handleToggleWebhook(wh.id)}
                          className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold cursor-pointer ${wh.isActive ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300"}`}
                        >
                          {wh.isActive ? "Activo" : "Inactivo"}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {wh.description}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeleteWebhook(wh.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Borrar
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                    <div>
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 block">
                        Eventos
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {wh.events.map((evt) => (
                          <span
                            key={evt}
                            className="bg-gray-100 dark:bg-[#111b21] text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded text-xs font-mono border border-gray-200 dark:border-gray-700"
                          >
                            {evt}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 block">
                        Signing Secret (HMAC)
                      </span>
                      <div className="flex items-center gap-2 bg-gray-50 dark:bg-[#111b21] border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 font-mono text-xs">
                        <span className="flex-1 truncate dark:text-gray-300">
                          {visibleSecrets.includes(wh.id)
                            ? wh.secret
                            : "•".repeat(24)}
                        </span>
                        <button
                          onClick={() => toggleSecret(wh.id)}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
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
                                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
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
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* DELIVERY LOGS SECTION */}
            <div className="mt-12">
              <h3 className="font-bold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-500" />
                Logs de Entrega Recientes
              </h3>
              <div className="bg-white dark:bg-[#1f2c34] rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs font-semibold text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="px-6 py-3">Estado</th>
                      <th className="px-6 py-3">Evento</th>
                      <th className="px-6 py-3">URL Destino</th>
                      <th className="px-6 py-3">Fecha</th>
                      <th className="px-6 py-3 text-right">Duración</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                    {logs.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-8 text-center text-gray-400"
                        >
                          No hay actividad reciente.
                        </td>
                      </tr>
                    ) : (
                      logs.map((log: any) => (
                        <tr
                          key={log.id}
                          className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                        >
                          <td className="px-6 py-3">
                            {log.status >= 200 && log.status < 300 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                <CheckCircle className="w-3 h-3" /> {log.status}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                <XCircle className="w-3 h-3" /> {log.status}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">
                            {log.eventType}
                          </td>
                          <td
                            className="px-6 py-3 text-gray-500 dark:text-gray-400 truncate max-w-[200px]"
                            title={log.url}
                          >
                            {log.url}
                          </td>
                          <td className="px-6 py-3 text-gray-500 dark:text-gray-400 text-xs">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td className="px-6 py-3 text-right font-mono text-xs text-gray-500 dark:text-gray-400">
                            {log.duration}ms
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* --- API KEYS TAB --- */}
        {activeTab === "api-keys" && (
          <>
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-gray-700 dark:text-gray-300">
                API Keys Activas
              </h3>
              <button
                onClick={() => setIsCreatingKey(!isCreatingKey)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                {isCreatingKey ? "Cancelar" : "+ Nueva API Key"}
              </button>
            </div>

            {generatedKey && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-6 rounded-xl mb-8 animate-fade-in">
                <div className="flex items-start gap-3">
                  <div className="bg-green-100 dark:bg-green-800 p-2 rounded-full text-green-600 dark:text-green-300">
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-green-800 dark:text-green-300 text-lg mb-1">
                      ¡API Key Creada!
                    </h4>
                    <p className="text-green-700 dark:text-green-400 text-sm mb-4">
                      Copia esta clave ahora. No podrás verla de nuevo.
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="bg-white dark:bg-black/30 px-3 py-2 rounded border border-green-200 dark:border-green-800 font-mono text-sm flex-1 break-all select-all">
                        {generatedKey}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(generatedKey);
                          toast.success("Copiado!");
                        }}
                        className="bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700 text-sm font-medium"
                      >
                        Copiar
                      </button>
                    </div>
                    <button
                      onClick={() => setGeneratedKey(null)}
                      className="mt-4 text-sm text-green-700 dark:text-green-400 hover:underline"
                    >
                      He guardado la clave
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isCreatingKey && !generatedKey && (
              <div className="bg-white dark:bg-[#202c33] p-6 rounded-xl border border-indigo-100 dark:border-indigo-900 shadow-md mb-8 animate-fade-in">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Nombre de la Clave
                  </label>
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="Ej: Servidor de Producción"
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#2a3942] text-gray-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 text-sm"
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

            <div className="space-y-4">
              {apiKeys.length === 0 && !isCreatingKey && (
                <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                  No hay API Keys generadas.
                </div>
              )}
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="bg-white dark:bg-[#202c33] border border-gray-200 dark:border-gray-700 rounded-lg p-6 flex justify-between items-center hover:shadow-sm transition-shadow"
                >
                  <div>
                    <h4 className="font-bold text-gray-800 dark:text-white mb-1">
                      {key.name}
                    </h4>
                    <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 font-mono">
                      <span>{key.keyPrefix}</span>
                      <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">
                        Creada: {new Date(key.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteApiKey(key.id)}
                    className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded text-sm font-medium transition-colors"
                  >
                    Revocar
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
