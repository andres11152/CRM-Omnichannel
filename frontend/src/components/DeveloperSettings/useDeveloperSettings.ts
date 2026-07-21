import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/lib/axios";
import { WebhookEndpoint, WebhookEventType } from "@/types";
import { useModal } from "@/context/ModalContext";
import { ApiKey, DeliveryLog } from "./types";

export const useDeveloperSettings = () => {
  const { t } = useTranslation();
  const { confirm } = useModal();
  const [activeTab, setActiveTab] = useState<"webhooks" | "api-keys" | "api-docs">("webhooks");

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
      toast.success(t("developer_settings_hook.toast.logs_refreshed", "Logs actualizados"));
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
      toast.success(t("developer_settings_hook.toast.webhook_created", "Webhook creado"));
    } catch {
      toast.error(t("developer_settings_hook.toast.webhook_create_error", "Error al crear webhook"));
    } finally {
      setIsSavingWebhook(false);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    const ok = await confirm({
      title: t("developer_settings_hook.confirm.delete_webhook_title", "Eliminar webhook"),
      message: t("developer_settings_hook.confirm.delete_webhook_message", "¿Estás seguro? Las entregas en curso se cancelarán y no podrás recuperar este endpoint."),
      confirmText: t("developer_settings_hook.confirm.delete_cta", "Eliminar"),
      cancelText: t("common.cancel", "Cancelar"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/webhooks/${id}`);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      toast.success(t("developer_settings_hook.toast.webhook_deleted", "Webhook eliminado"));
    } catch {
      toast.error(t("developer_settings_hook.toast.webhook_delete_error", "Error al eliminar webhook"));
    }
  };

  const handleToggleWebhook = async (id: string, current: boolean) => {
    try {
      await api.patch(`/webhooks/${id}/toggle`);
      setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, isActive: !w.isActive } : w)));
      toast.success(current ? t("developer_settings_hook.toast.webhook_deactivated", "Webhook desactivado") : t("developer_settings_hook.toast.webhook_activated", "Webhook activado"));
    } catch {
      toast.error(t("developer_settings_hook.toast.webhook_toggle_error", "Error al cambiar estado del webhook"));
    }
  };

  const handleReplayLog = async (logId: string) => {
    try {
      await api.post(`/webhooks/logs/${logId}/retry`);
      toast.success(t("developer_settings_hook.toast.retry_scheduled", "Reintento programado"));
    } catch {
      toast.error(t("developer_settings_hook.toast.retry_error", "Error al reintentar entrega"));
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
    setSelectedEvents((prev) => (prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt]));
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
      toast.error(t("developer_settings_hook.toast.api_key_create_error", "Error al crear API Key"));
    }
  };

  const handleRevokeApiKey = async (id: string, name: string) => {
    const ok = await confirm({
      title: t("developer_settings_hook.confirm.revoke_key_title", "Revocar clave API"),
      message: t("developer_settings_hook.confirm.revoke_key_message", '¿Revocar "{{name}}"? Las integraciones que la usen dejarán de funcionar de inmediato.', { name }),
      confirmText: t("developer_settings_hook.confirm.revoke_cta", "Revocar"),
      cancelText: t("common.cancel", "Cancelar"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/api-keys/${id}`);
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
      toast.success(t("developer_settings_hook.toast.api_key_revoked", "Clave API revocada"));
    } catch {
      toast.error(t("developer_settings_hook.toast.api_key_revoke_error", "Error al revocar la clave"));
    }
  };

  return {
    activeTab,
    setActiveTab,
    webhooks,
    apiKeys,
    logs,
    isCreatingWebhook,
    setIsCreatingWebhook,
    newUrl,
    setNewUrl,
    newDesc,
    setNewDesc,
    selectedEvents,
    visibleSecrets,
    isCreatingKey,
    setIsCreatingKey,
    newKeyName,
    setNewKeyName,
    generatedKey,
    setGeneratedKey,
    isSavingWebhook,
    isRefreshingLogs,
    handleRefreshLogs,
    handleCreateWebhook,
    handleDeleteWebhook,
    handleToggleWebhook,
    handleReplayLog,
    toggleSecretVisibility,
    toggleEvent,
    handleCreateApiKey,
    handleRevokeApiKey,
  };
};

export type DeveloperSettingsState = ReturnType<typeof useDeveloperSettings>;
