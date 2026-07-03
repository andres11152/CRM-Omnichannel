import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/axios";
import { WebhookEndpoint, WebhookEventType } from "@/types";
import { ModuleHeader } from "./common/ModuleHeader";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { useModal } from "@/context/ModalContext";
import {
  Clipboard,
  ShieldCheck,
  Activity,
  CheckCircle,
  XCircle,
  Code,
  Eye,
  EyeOff,
  RefreshCw,
  RotateCcw,
  Key,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

interface DeliveryLog {
  id: string;
  webhookId: string;
  status: number;
  eventType: string;
  url: string;
  createdAt: string;
  duration: number;
  error?: string;
  attempt: number;
}

// ── Event catalog ─────────────────────────────────────────────────────────────

const AVAILABLE_EVENTS: WebhookEventType[] = [
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
  "property.created",
  "property.updated",
  "property.published",
  "property.status_changed",
  "property.deleted",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const copyToClipboard = (text: string, label = "Copiado") => {
  navigator.clipboard.writeText(text).then(() => toast.success(label));
};

// ── Component ─────────────────────────────────────────────────────────────────

export const DeveloperSettings: React.FC = () => {
  const { confirm } = useModal();
  const [activeTab, setActiveTab] = useState<"webhooks" | "api-keys" | "api-docs">(
    "webhooks",
  );

  // ── Data state ──────────────────────────────────────────────────────────────

  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [logs, setLogs] = useState<DeliveryLog[]>([]);

  // ── Webhook form state ───────────────────────────────────────────────────────

  const [isCreatingWebhook, setIsCreatingWebhook] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<WebhookEventType[]>([]);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());

  // ── API Key form state ───────────────────────────────────────────────────────

  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  // ── Busy flags ───────────────────────────────────────────────────────────────

  const [isSavingWebhook, setIsSavingWebhook] = useState(false);
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const fetchWebhooks = useCallback(async () => {
    try {
      const res = await api.get("/webhooks");
      const data = res.data.data ?? res.data;
      setWebhooks(Array.isArray(data) ? data : []);
    } catch {
      // silent — no toast on background refresh
    }
  }, []);

  const fetchApiKeys = useCallback(async () => {
    try {
      const res = await api.get("/api-keys");
      const data = res.data.data ?? res.data;
      setApiKeys(Array.isArray(data) ? data : []);
    } catch {
      // silent
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await api.get("/webhooks/logs");
      const data = res.data.data ?? res.data;
      setLogs(Array.isArray(data) ? data : []);
    } catch {
      // silent
    }
  }, []);

  const handleRefreshLogs = async () => {
    setIsRefreshingLogs(true);
    try {
      await fetchLogs();
      toast.success("Logs actualizados");
    } finally {
      setIsRefreshingLogs(false);
    }
  };

  useEffect(() => {
    fetchWebhooks();
    fetchApiKeys();
    fetchLogs();
  }, [fetchWebhooks, fetchApiKeys, fetchLogs]);

  // ── Webhook actions ──────────────────────────────────────────────────────────

  const handleCreateWebhook = async () => {
    if (!newUrl) return;
    setIsSavingWebhook(true);
    try {
      await api.post("/webhooks", {
        url: newUrl,
        description: newDesc || undefined,
        events: selectedEvents.length > 0 ? selectedEvents : ["message.received"],
      });
      await fetchWebhooks();
      setIsCreatingWebhook(false);
      setNewUrl("");
      setNewDesc("");
      setSelectedEvents([]);
      toast.success("Webhook creado");
    } catch {
      toast.error("Error al crear webhook");
    } finally {
      setIsSavingWebhook(false);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    const ok = await confirm({
      title: "Eliminar webhook",
      message:
        "¿Estás seguro? Las entregas en curso se cancelarán y no podrás recuperar este endpoint.",
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/webhooks/${id}`);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      toast.success("Webhook eliminado");
    } catch {
      toast.error("Error al eliminar webhook");
    }
  };

  const handleToggleWebhook = async (id: string, current: boolean) => {
    try {
      await api.patch(`/webhooks/${id}/toggle`);
      setWebhooks((prev) =>
        prev.map((w) => (w.id === id ? { ...w, isActive: !w.isActive } : w)),
      );
      toast.success(current ? "Webhook desactivado" : "Webhook activado");
    } catch {
      toast.error("Error al cambiar estado del webhook");
    }
  };

  const handleReplayLog = async (logId: string) => {
    try {
      await api.post(`/webhooks/logs/${logId}/retry`);
      toast.success("Reintento programado");
    } catch {
      toast.error("Error al reintentar entrega");
    }
  };

  const toggleSecretVisibility = (id: string) => {
    setVisibleSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleEvent = (evt: WebhookEventType) => {
    setSelectedEvents((prev) =>
      prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt],
    );
  };

  // ── API Key actions ──────────────────────────────────────────────────────────

  const handleCreateApiKey = async () => {
    try {
      const res = await api.post("/api-keys", { name: newKeyName || "API Key" });
      const data = res.data.data ?? res.data;
      setGeneratedKey(data.secretKey ?? null);
      await fetchApiKeys();
      setIsCreatingKey(false);
      setNewKeyName("");
    } catch {
      toast.error("Error al crear API Key");
    }
  };

  const handleRevokeApiKey = async (id: string, name: string) => {
    const ok = await confirm({
      title: "Revocar clave API",
      message: `¿Revocar "${name}"? Las integraciones que la usen dejarán de funcionar de inmediato.`,
      confirmText: "Revocar",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/api-keys/${id}`);
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
      toast.success("Clave API revocada");
    } catch {
      toast.error("Error al revocar la clave");
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-white dark:bg-reply-panel-dark rounded-lg shadow-sm border border-gray-200 dark:border-reply-border-dark transition-colors duration-200">
      <ModuleHeader
        title="Developer API & Webhooks"
        description="Webhooks para eventos en tiempo real y API Keys para acceso programático externo."
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
              ? webhooks.filter((w) => w.isActive).length
              : apiKeys.length,
        }}
        action={
          <div className="flex bg-black/20 rounded-xl p-1 backdrop-blur-sm border border-white/10 shrink-0">
            {(
              [
                { key: "webhooks", icon: Activity, label: "Webhooks" },
                { key: "api-keys", icon: ShieldCheck, label: "API Keys" },
                { key: "api-docs", icon: Code, label: "API Docs" },
              ] as const
            ).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-3 md:px-5 py-1.5 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center gap-2 ${
                  activeTab === key
                    ? "bg-white text-gray-900 shadow-lg"
                    : "text-white/70 hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto bg-reply-bg dark:bg-reply-bg-dark p-4 md:p-8">
        <div className="max-w-5xl mx-auto space-y-8 pb-12">

          {/* ── WEBHOOKS TAB ────────────────────────────────────────────── */}
          {activeTab === "webhooks" && (
            <div className="animate-in fade-in duration-500 space-y-6">

              {/* Header card */}
              <Card className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5">
                <div>
                  <h3 className="font-bold text-reply-text-primary dark:text-white text-lg flex items-center gap-2">
                    Endpoints Configurados
                    <Badge variant="info">{webhooks.length}</Badge>
                  </h3>
                  <p className="text-xs text-reply-text-secondary dark:text-reply-text-secondary-dark mt-1">
                    Configura URLs externas donde Sentry enviará eventos en tiempo real vía HMAC-SHA256.
                  </p>
                </div>
                <Button
                  onClick={() => setIsCreatingWebhook(!isCreatingWebhook)}
                  variant={isCreatingWebhook ? "secondary" : "primary"}
                  className="w-full sm:w-auto"
                >
                  {isCreatingWebhook ? (
                    <span>Cerrar</span>
                  ) : (
                    <>
                      <Activity className="w-4 h-4" />
                      <span>Nuevo Webhook</span>
                    </>
                  )}
                </Button>
              </Card>

              {/* Creation form */}
              {isCreatingWebhook && (
                <Card className="p-6 border border-reply-brand/20 shadow-xl space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Input
                      type="url"
                      label="Endpoint URL (POST)"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      placeholder="https://api.empresa.com/webhook"
                      className="font-mono"
                    />
                    <Input
                      type="text"
                      label="Descripción (opcional)"
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      placeholder="Ej: Integración con ERP Interno"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-black text-reply-text-secondary dark:text-reply-text-secondary-dark uppercase tracking-widest block">
                      Eventos a Suscribir
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {AVAILABLE_EVENTS.map((evt) => (
                        <button
                          key={evt}
                          onClick={() => toggleEvent(evt)}
                          className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                            selectedEvents.includes(evt)
                              ? "bg-reply-brand text-white border-reply-brand shadow-sm"
                              : "bg-white dark:bg-reply-panel-dark text-reply-text-secondary dark:text-reply-text-secondary-dark border-reply-border dark:border-reply-border-dark hover:border-reply-brand"
                          }`}
                        >
                          {evt.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    {selectedEvents.length === 0 && (
                      <p className="text-[10px] text-reply-text-secondary/70 dark:text-reply-text-secondary-dark/70">
                        Sin selección → se suscribirá a <code className="font-mono">message.received</code>
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleCreateWebhook}
                      variant="primary"
                      size="lg"
                      disabled={!newUrl || isSavingWebhook}
                    >
                      {isSavingWebhook ? "Guardando…" : "Guardar Configuración"}
                    </Button>
                  </div>
                </Card>
              )}

              {/* Webhook list */}
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
                  <Card
                    key={wh.id}
                    hoverable
                    className="p-5 md:p-6 hover:shadow-md transition-all group overflow-hidden relative"
                  >
                    <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              wh.isActive
                                ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"
                                : "bg-gray-400"
                            }`}
                          />
                          <h4 className="font-bold text-reply-text-primary dark:text-white font-mono text-sm break-all">
                            {wh.url}
                          </h4>
                        </div>
                        {wh.description && (
                          <p className="text-sm text-reply-text-secondary dark:text-reply-text-secondary-dark pl-5">
                            {wh.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 w-full md:w-auto justify-end border-t md:border-t-0 pt-3 md:pt-0 border-reply-border dark:border-reply-border-dark">
                        <Button
                          onClick={() => handleToggleWebhook(wh.id, wh.isActive)}
                          variant="secondary"
                          size="sm"
                          className={
                            wh.isActive
                              ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400 dark:hover:bg-emerald-500/30 border-none"
                              : ""
                          }
                        >
                          {wh.isActive ? "DESACTIVAR" : "ACTIVAR"}
                        </Button>
                        <Button
                          onClick={() => handleDeleteWebhook(wh.id)}
                          variant="ghost"
                          size="sm"
                          className="p-1.5 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:hover:bg-rose-500/20"
                        >
                          <XCircle className="w-5 h-5" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 bg-reply-bg dark:bg-black/20 p-4 rounded-xl border border-reply-border dark:border-reply-border-dark">
                      <div>
                        <span className="text-[10px] font-black text-reply-text-secondary dark:text-reply-text-secondary-dark uppercase mb-2 block tracking-widest">
                          Eventos Suscritos
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {wh.events.map((evt) => (
                            <Badge
                              key={evt}
                              variant="info"
                              className="bg-white dark:bg-reply-surface-dark border-reply-border dark:border-reply-border-dark text-reply-brand dark:text-reply-brand-light"
                            >
                              {evt}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-reply-text-secondary dark:text-reply-text-secondary-dark uppercase mb-2 block tracking-widest">
                          Signing Secret (HMAC-SHA256)
                        </span>
                        <div className="flex items-center gap-2 bg-white dark:bg-reply-surface-dark border border-reply-border dark:border-reply-border-dark rounded-lg px-3 py-2 font-mono text-xs shadow-sm">
                          <span className="flex-1 truncate dark:text-gray-300">
                            {visibleSecrets.has(wh.id)
                              ? wh.secretKey
                              : "•".repeat(32)}
                          </span>
                          <button
                            onClick={() => toggleSecretVisibility(wh.id)}
                            className="text-gray-400 hover:text-reply-brand dark:hover:text-reply-brand-light transition-colors cursor-pointer"
                            title={visibleSecrets.has(wh.id) ? "Ocultar" : "Mostrar"}
                          >
                            {visibleSecrets.has(wh.id) ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => copyToClipboard(wh.secretKey, "Secret copiado")}
                            className="text-gray-400 hover:text-reply-brand dark:hover:text-reply-brand-light transition-colors cursor-pointer"
                            title="Copiar"
                          >
                            <Clipboard className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Delivery logs */}
              <div className="mt-12 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-reply-text-primary dark:text-white text-lg flex items-center gap-2">
                    <Activity className="w-5 h-5 text-reply-brand" />
                    Logs de Entrega Recientes
                  </h3>
                  <button
                    onClick={handleRefreshLogs}
                    disabled={isRefreshingLogs}
                    className="flex items-center gap-1.5 text-reply-brand dark:text-reply-brand-light text-xs font-black hover:underline cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingLogs ? "animate-spin" : ""}`} />
                    ACTUALIZAR
                  </button>
                </div>

                {/* Desktop table */}
                <Card className="hidden lg:block overflow-hidden shadow-sm border-reply-border dark:border-reply-border-dark">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-reply-bg dark:bg-gray-800/50 text-[10px] uppercase tracking-widest font-bold text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-reply-border-dark">
                      <tr>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Evento</th>
                        <th className="px-6 py-4">URL Destino</th>
                        <th className="px-6 py-4">Fecha/Hora</th>
                        <th className="px-6 py-4 text-right">Latencia</th>
                        <th className="px-6 py-4" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                      {logs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic">
                            No hay actividad reciente.
                          </td>
                        </tr>
                      ) : (
                        logs.map((log) => {
                          const isSuccess = log.status >= 200 && log.status < 300;
                          return (
                            <tr
                              key={log.id}
                              className="hover:bg-reply-bg dark:hover:bg-white/5 transition-colors group"
                            >
                              <td className="px-6 py-4">
                                <Badge variant={isSuccess ? "success" : "error"}>
                                  {isSuccess ? (
                                    <CheckCircle className="w-3.5 h-3.5" />
                                  ) : (
                                    <XCircle className="w-3.5 h-3.5" />
                                  )}{" "}
                                  {log.status || "ERR"}
                                </Badge>
                              </td>
                              <td className="px-6 py-4 font-mono text-[11px] font-bold text-reply-text-secondary dark:text-reply-text-secondary-dark">
                                {log.eventType}
                              </td>
                              <td
                                className="px-6 py-4 text-reply-text-secondary dark:text-reply-text-secondary-dark truncate max-w-[200px] font-mono text-xs"
                                title={log.url}
                              >
                                {log.url}
                              </td>
                              <td className="px-6 py-4 text-reply-text-secondary/60 dark:text-reply-text-secondary-dark/60 text-xs">
                                {new Date(log.createdAt).toLocaleString()}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-[11px] font-bold text-reply-brand">
                                {log.duration}ms
                              </td>
                              <td className="px-6 py-4 text-right">
                                {!isSuccess && (
                                  <button
                                    onClick={() => handleReplayLog(log.id)}
                                    className="text-reply-text-secondary/60 hover:text-reply-brand dark:hover:text-reply-brand-light transition-colors cursor-pointer"
                                    title="Reintentar entrega"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </Card>

                {/* Mobile cards */}
                <div className="lg:hidden space-y-3">
                  {logs.length === 0 ? (
                    <div className="text-center py-10 text-reply-text-secondary dark:text-reply-text-secondary-dark italic text-sm">
                      No hay actividad reciente.
                    </div>
                  ) : (
                    logs.map((log) => {
                      const isSuccess = log.status >= 200 && log.status < 300;
                      return (
                        <Card key={log.id} className="p-4 space-y-3">
                          <div className="flex justify-between items-start">
                            <Badge variant={isSuccess ? "success" : "error"}>
                              {isSuccess ? (
                                <CheckCircle className="w-3.5 h-3.5" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5" />
                              )}{" "}
                              {log.status || "ERR"}
                            </Badge>
                            <div className="flex items-center gap-3">
                              <span className="text-[11px] font-bold text-reply-brand font-mono">
                                {log.duration}ms
                              </span>
                              {!isSuccess && (
                                <button
                                  onClick={() => handleReplayLog(log.id)}
                                  className="text-reply-text-secondary/60 hover:text-reply-brand dark:hover:text-reply-brand-light transition-colors cursor-pointer"
                                  title="Reintentar"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p className="font-mono text-[11px] font-bold text-reply-text-primary dark:text-reply-text-primary-dark">
                              {log.eventType}
                            </p>
                            <p className="text-[10px] text-reply-text-secondary/80 dark:text-reply-text-secondary-dark/80 break-all font-mono">
                              {log.url}
                            </p>
                          </div>
                          <div className="text-[10px] text-reply-text-secondary/60 dark:text-reply-text-secondary-dark/60 pt-2 border-t border-reply-border dark:border-reply-border-dark flex justify-between">
                            <span>INTENTO #{log.attempt}</span>
                            <span>{new Date(log.createdAt).toLocaleString()}</span>
                          </div>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── API KEYS TAB ─────────────────────────────────────────────── */}
          {activeTab === "api-keys" && (
            <div className="animate-in fade-in duration-500 space-y-6">
              <Card className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5">
                <div>
                  <h3 className="font-bold text-reply-text-primary dark:text-white text-lg flex items-center gap-2">
                    Claves API Activas
                    <Badge variant="info">{apiKeys.length}</Badge>
                  </h3>
                  <p className="text-xs text-reply-text-secondary dark:text-reply-text-secondary-dark mt-1">
                    Autentifica peticiones externas con el header{" "}
                    <code className="font-mono text-reply-brand dark:text-reply-brand-light">X-API-Key</code>.
                  </p>
                </div>
                <Button
                  onClick={() => setIsCreatingKey(!isCreatingKey)}
                  variant={isCreatingKey ? "secondary" : "primary"}
                  className="w-full sm:w-auto"
                >
                  {isCreatingKey ? (
                    <span>Cerrar</span>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Nueva API Key</span>
                    </>
                  )}
                </Button>
              </Card>

              {/* One-time key display */}
              {generatedKey && (
                <Card className="bg-emerald-50 dark:bg-emerald-950/20 border-2 border-emerald-200 dark:border-emerald-900/50 p-6 shadow-md">
                  <div className="flex items-start gap-4">
                    <div className="bg-emerald-100 dark:bg-emerald-900/50 p-3 rounded-2xl text-emerald-600 dark:text-emerald-400 shadow-sm">
                      <Key className="w-6 h-6" />
                    </div>
                    <div className="flex-1 space-y-4">
                      <div>
                        <h4 className="font-bold text-emerald-800 dark:text-emerald-300 text-lg">
                          ¡API Key Generada!
                        </h4>
                        <p className="text-emerald-700 dark:text-emerald-400/80 text-xs font-medium">
                          Copia esta clave inmediatamente. Por seguridad, no volverá a mostrarse.
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <div className="flex-1 bg-white dark:bg-black/40 px-4 py-3 rounded-xl border border-emerald-100 dark:border-emerald-900 shadow-inner font-mono text-xs break-all text-gray-800 dark:text-gray-200 select-all">
                          {generatedKey}
                        </div>
                        <Button
                          onClick={() => copyToClipboard(generatedKey, "Clave copiada")}
                          variant="primary"
                          size="lg"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 border-none shrink-0"
                        >
                          <Clipboard className="w-4 h-4" /> Copiar
                        </Button>
                      </div>

                      <button
                        onClick={() => setGeneratedKey(null)}
                        className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline uppercase tracking-widest cursor-pointer"
                      >
                        Ya la guardé — Continuar
                      </button>
                    </div>
                  </div>
                </Card>
              )}

              {/* Creation form */}
              {isCreatingKey && !generatedKey && (
                <Card className="p-6 border border-reply-brand/20 shadow-md animate-in fade-in duration-300">
                  <div className="mb-4">
                    <Input
                      type="text"
                      label="Nombre de la Clave"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="Ej: Servidor de Producción"
                      onKeyDown={(e) => e.key === "Enter" && handleCreateApiKey()}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleCreateApiKey} variant="primary">
                      Generar Clave
                    </Button>
                  </div>
                </Card>
              )}

              {/* Key list */}
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
                  <Card
                    key={key.id}
                    hoverable
                    className="p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-reply-brand/10 dark:bg-reply-brand/20 rounded-xl flex items-center justify-center text-reply-brand flex-shrink-0">
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-reply-text-primary dark:text-white mb-0.5">
                          {key.name}
                        </h4>
                        <div className="flex flex-wrap items-center gap-3">
                          <Badge variant="info" className="font-mono text-[10px] font-black uppercase tracking-widest">
                            {key.keyPrefix}
                          </Badge>
                          <span className="text-[10px] text-reply-text-secondary/60 dark:text-reply-text-secondary-dark/60 uppercase font-bold tracking-tight">
                            Creada el {new Date(key.createdAt).toLocaleDateString()}
                          </span>
                          {key.lastUsedAt && (
                            <span className="text-[10px] text-reply-text-secondary/60 dark:text-reply-text-secondary-dark/60 uppercase font-bold tracking-tight">
                              · Usada el {new Date(key.lastUsedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end border-t md:border-t-0 pt-3 md:pt-0 border-reply-border dark:border-reply-border-dark w-full md:w-auto">
                      <Button
                        onClick={() => handleRevokeApiKey(key.id, key.name)}
                        variant="ghost"
                        className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:hover:bg-rose-500/20 w-full md:w-auto text-xs uppercase tracking-widest font-black"
                      >
                        Revocar Acceso
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* ── API DOCS TAB ─────────────────────────────────────────────── */}
          {activeTab === "api-docs" && (
            <div className="animate-in fade-in duration-500 space-y-6">
              <Card className="p-6">
                <div className="mb-6">
                  <h3 className="font-bold text-reply-text-primary dark:text-white text-xl flex items-center gap-2">
                    <Code className="w-6 h-6 text-reply-brand" />
                    Referencia de API REST
                  </h3>
                  <p className="text-sm text-reply-text-secondary dark:text-reply-text-secondary-dark mt-2 leading-relaxed">
                    Integra Sentry con tus sistemas internos. Autentícate enviando tu API Key en el header{" "}
                    <code className="bg-reply-bg dark:bg-reply-bg-dark px-1.5 py-0.5 rounded text-reply-brand dark:text-reply-brand-light font-mono text-xs border border-reply-border dark:border-reply-border-dark">
                      X-API-Key
                    </code>
                    . Base URL:{" "}
                    <code className="bg-reply-bg dark:bg-reply-bg-dark px-1.5 py-0.5 rounded text-reply-brand dark:text-reply-brand-light font-mono text-xs border border-reply-border dark:border-reply-border-dark">
                      https://api.sentrycrm.cloud/api/v1/external
                    </code>
                  </p>
                </div>

                <div className="space-y-8">
                  {/* Webhook payload reference */}
                  <div className="border border-amber-200 dark:border-amber-900/50 rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-amber-50 dark:bg-amber-950/30 p-4 border-b border-amber-200 dark:border-amber-900/50 flex items-center gap-4">
                      <span className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider">PAYLOAD</span>
                      <span className="font-mono text-sm text-reply-text-primary dark:text-white font-bold">Estructura de Evento Webhook</span>
                    </div>
                    <div className="p-4 bg-gray-900 text-gray-300 font-mono text-xs overflow-x-auto">
                      <pre>{`{
  "id": "evt_1750000000_a1b2c3d4",
  "object": "event",
  "apiVersion": "2025-04-01",
  "created": 1750000000,
  "type": "ticket.created",
  "data": {
    "object": { /* payload específico del evento */ }
  }
}

// Header de verificación HMAC-SHA256:
// X-Sentry-Signature: t=<timestamp>,v1=<sha256_hex>
// Verifica: HMAC-SHA256(secret, "<timestamp>.<json_body>")`}</pre>
                    </div>
                  </div>

                  {[
                    {
                      method: "POST",
                      path: "/messages/send",
                      label: "Enviar Mensaje WhatsApp",
                      color: "emerald",
                      body: `{
  "to": "573001234567",
  "text": "Hola, este es un mensaje automático desde la API de Sentry."
}`,
                    },
                    {
                      method: "POST",
                      path: "/contacts",
                      label: "Crear o Actualizar Contacto",
                      color: "emerald",
                      body: `{
  "name": "Juan Pérez",
  "phone": "573001234567",
  "email": "juan@empresa.com",
  "tags": ["Cliente VIP", "API"]
}`,
                    },
                    {
                      method: "POST",
                      path: "/deals",
                      label: "Crear Oportunidad (Deal)",
                      color: "emerald",
                      body: `{
  "title": "Renovación 2025",
  "value": 15000,
  "currency": "USD",
  "pipelineId": "<cuid_pipeline>",
  "stageId": "<cuid_stage>"
}`,
                    },
                    {
                      method: "GET",
                      path: "/tickets",
                      label: "Listar Tickets",
                      color: "sky",
                      body: null,
                    },
                  ].map(({ method, path, label, color, body }) => (
                    <div
                      key={path}
                      className="border border-reply-border dark:border-reply-border-dark rounded-xl overflow-hidden shadow-sm"
                    >
                      <div className="bg-reply-bg dark:bg-reply-bg-dark/50 p-4 border-b border-reply-border dark:border-reply-border-dark flex items-center gap-4">
                        <span
                          className={`bg-${color}-500/10 text-${color}-600 dark:text-${color}-400 border border-${color}-500/20 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider`}
                        >
                          {method}
                        </span>
                        <span className="font-mono text-sm text-reply-text-primary dark:text-white font-bold">
                          {path}
                        </span>
                        <span className="text-xs text-reply-text-secondary dark:text-reply-text-secondary-dark ml-auto hidden sm:block">
                          {label}
                        </span>
                      </div>
                      <div className="p-4 bg-gray-900 text-gray-300 font-mono text-xs overflow-x-auto">
                        <pre>{`curl -X ${method} https://api.sentrycrm.cloud/api/v1/external${path} \\
  -H "X-API-Key: tu_api_key_aqui"${
    body
      ? ` \\
  -H "Content-Type: application/json" \\
  -d '${body}'`
      : ""
  }`}</pre>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
