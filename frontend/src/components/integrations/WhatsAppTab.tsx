import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import QRCode from "react-qr-code";
import { useTranslation } from "react-i18next";
import { socketService } from "@/services/socketService";
import { API_BASE_URL } from "@/services/apiConfig";
import { Logger } from "@/utils/logger";
import { Modal } from "../ui/Modal";

interface WhatsAppSession {
  sessionId: string;
  status: string;
  phone: string | null;
  qrCode: string | null;
  profileName?: string | null;
  defaultQueueId?: string | null;
  createdAt: string;
}

interface Queue {
  id: string;
  name: string;
}

export const WhatsAppTab: React.FC = () => {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [currentQr, setCurrentQr] = useState<string | null>(null);
  const [scanningSessionId, setScanningSessionId] = useState<string | null>(null);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [reconnectingIds, setReconnectingIds] = useState<Set<string>>(new Set());
  const [profileNameDrafts, setProfileNameDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (sessions.length > 0) {
      setProfileNameDrafts((prev) => {
        const next = { ...prev };
        sessions.forEach((s) => {
          if (s.profileName && next[s.sessionId] === undefined) {
            next[s.sessionId] = s.profileName;
          }
        });
        return next;
      });
    }
  }, [sessions]);

  const [reviewModeActive, setReviewModeActive] = useState<boolean>(() => {
    if (localStorage.getItem("isReviewMode") === "true") return true;
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("review") === "true") return true;
    return false;
  });
  const [reviewClickCount, setReviewClickCount] = useState(0);

  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingPhone, setPairingPhone] = useState("");
  const [connectionMethod, setConnectionMethod] = useState<"qr" | "phone" | "meta">(
    reviewModeActive ? "meta" : "qr"
  );
  const [loadingPairingCode, setLoadingPairingCode] = useState(false);

  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState("");
  const [metaBusinessId, setMetaBusinessId] = useState("");
  const [metaVerifyToken, setMetaVerifyToken] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(false);

  const sessionsRef = useRef(sessions);
  const scanningSessionIdRef = useRef(scanningSessionId);
  const currentQrRef = useRef(currentQr);
  const isScanningRef = useRef(isScanning);

  useEffect(() => {
    setMetaVerifyToken("reply_verify_" + Math.random().toString(36).substring(5));
  }, []);

  useEffect(() => {
    sessionsRef.current = sessions;
    scanningSessionIdRef.current = scanningSessionId;
    currentQrRef.current = currentQr;
    isScanningRef.current = isScanning;
  }, [sessions, scanningSessionId, currentQr, isScanning]);

  const fetchSessions = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/whatsapp/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status === "success") {
        const sortedSessions = data.data.sessions.sort(
          (a: WhatsAppSession, b: WhatsAppSession) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        setSessions(sortedSessions);

        const currentScanningId = scanningSessionIdRef.current;
        if (currentScanningId) {
          const activeSession = data.data.sessions.find(
            (s: WhatsAppSession) => s.sessionId === currentScanningId,
          );
          if (!activeSession || activeSession.status === "CONNECTED") {
            setIsScanning(false);
            setCurrentQr(null);
            setScanningSessionId(null);
          } else if (activeSession.qrCode && activeSession.qrCode !== currentQrRef.current) {
            setCurrentQr(activeSession.qrCode);
          }
        }
      }
      setError(null);
    } catch (err) {
      console.error("Failed to fetch sessions", err);
      setError(t("integrations.whatsapp.error.fetch", "No se pudo conectar con el servidor. Verifica tu conexión."));
    }
  };

  const fetchQueues = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/queues`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setQueues(data);
      }
    } catch (e) {
      console.error("Failed to fetch queues", e);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchQueues();

    const handleQrUpdate = (data: { sessionId: string; qr: string }) => {
      const currentScanningId = scanningSessionIdRef.current;
      if (data.sessionId === currentScanningId) {
        setCurrentQr(data.qr);
        setIsScanning(true);
      }

      setSessions((prev) => {
        const exists = prev.find((s) => s.sessionId === data.sessionId);
        if (exists) {
          return prev.map((s) => {
            if (s.sessionId === data.sessionId) {
              return { ...s, qrCode: data.qr, status: "SCANNING" };
            }
            return s;
          });
        } else {
          if (data.sessionId === currentScanningId) {
            return [
              ...prev,
              {
                sessionId: data.sessionId,
                status: "SCANNING",
                qrCode: data.qr,
                phone: null,
                createdAt: new Date().toISOString(),
              },
            ];
          }
          return prev;
        }
      });
    };

    const handleStatusUpdate = (data: { sessionId: string; status: string; phone?: string }) => {
      setSessions((prev) => {
        if (data.status === "DELETED") {
          return prev.filter((s) => s.sessionId !== data.sessionId);
        }
        return prev.map((s) => {
          if (s.sessionId !== data.sessionId) return s;
          return {
            ...s,
            status: data.status,
            phone: data.phone || s.phone,
            qrCode: data.status === "CONNECTED" ? null : s.qrCode,
          };
        });
      });

      if (data.status === "CONNECTED") {
        const currentScanningId = scanningSessionIdRef.current;
        const currentQrVal = currentQrRef.current;
        const currentSessions = sessionsRef.current;

        const isTargetSession = data.sessionId === currentScanningId;
        const matchesCurrentQr =
          currentQrVal &&
          currentSessions.find((s) => s.sessionId === data.sessionId)
            ?.qrCode === currentQrVal;

        if (isTargetSession || matchesCurrentQr) {
          Logger.info(`[ChatSync] Closing modal for connected session: ${data.sessionId}`);
          setIsScanning(false);
          setCurrentQr(null);
          setScanningSessionId(null);

          const phoneDisplay = data.phone ? `+${data.phone}` : "tu dispositivo";
          toast.success(t("integrations.whatsapp.connected_success", "WhatsApp {{phone}} vinculado", { phone: phoneDisplay }));
        }
      }
    };

    const handlePairingCodeUpdate = (data: { sessionId: string; code: string }) => {
      const currentScanningId = scanningSessionIdRef.current;
      if (data.sessionId === currentScanningId) {
        setPairingCode(data.code);
        setIsScanning(true);
      }
    };

    socketService.on("qr.updated", handleQrUpdate);
    socketService.on("session.status", handleStatusUpdate);
    socketService.on("pairing_code.updated", handlePairingCodeUpdate);

    const interval = setInterval(fetchSessions, 10000);

    return () => {
      socketService.off("qr.updated", handleQrUpdate);
      socketService.off("session.status", handleStatusUpdate);
      socketService.off("pairing_code.updated", handlePairingCodeUpdate);
      clearInterval(interval);
    };
  }, []);

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const handleCreateSession = async () => {
    if (loading) {
      toast.info(t("integrations.whatsapp.loading_session", "Conexión en progreso…"));
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      let res: Response;
      try {
        res = await fetch(`${API_BASE_URL}/whatsapp/sessions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
      } catch (fetchErr: unknown) {
        clearTimeout(timeoutId);
        if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
          toast.info(t("integrations.whatsapp.timeout_wait", "Conectando… QR en camino"), { duration: 5000 });
          setIsScanning(true);
          await fetchSessions();
          return;
        }
        throw fetchErr;
      }
      clearTimeout(timeoutId);

      const data = await res.json();

      if (res.status === 403) {
        setShowUpgradeModal(true);
        return;
      }

      if (data.status === "success" && data.data.session) {
        const newSession = data.data.session;
        setScanningSessionId(newSession.sessionId);
        setIsScanning(true);
        if (newSession.qrCode) {
          setCurrentQr(newSession.qrCode);
        }
        await fetchSessions();
      }
    } catch (err) {
      console.error(err);
      toast.error(t("integrations.whatsapp.error.create", "Error de red al crear sesión"));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingPhone) {
      toast.error(t("integrations.whatsapp.validation.phone_required", "Por favor, ingresa tu número de teléfono."));
      return;
    }

    const cleanPhone = pairingPhone.replace(/\D/g, "");
    if (cleanPhone.length < 8) {
      toast.error(t("integrations.whatsapp.validation.phone_invalid", "Número de teléfono inválido."));
      return;
    }

    setLoadingPairingCode(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/whatsapp/sessions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone: cleanPhone,
        }),
      });

      const data = await res.json();
      if (res.status === 403) {
        setShowUpgradeModal(true);
        return;
      }

      if (data.status === "success" && data.data.session) {
        const newSession = data.data.session;
        setScanningSessionId(newSession.sessionId);
        if (data.data.code) {
          setPairingCode(data.data.code);
        }
        setIsScanning(true);
        await fetchSessions();
      } else {
        toast.error(data.message || t("integrations.whatsapp.error.code", "Error al solicitar código"));
      }
    } catch (err) {
      console.error(err);
      toast.error(t("integrations.whatsapp.error.connect", "Error al conectar"));
    } finally {
      setLoadingPairingCode(false);
    }
  };

  const handleCreateMetaSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingMeta(true);
    const toastId = toast.loading(t("integrations.whatsapp.meta.linking", "Vinculando con Meta..."));
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/whatsapp/sessions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "META",
          metaAccessToken,
          metaPhoneNumberId,
          metaBusinessId,
          metaVerifyToken,
        }),
      });
      const data = await res.json();
      if (res.status === 201 && data.status === "success") {
        toast.success(t("integrations.whatsapp.meta.linked_success", "Cuenta de Meta vinculada exitosamente"), { id: toastId });
        setIsScanning(false);
        setMetaAccessToken("");
        setMetaPhoneNumberId("");
        setMetaBusinessId("");
        fetchSessions();
      } else {
        toast.error(data.message || t("integrations.whatsapp.meta.error", "Error al vincular con Meta"), { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error(t("integrations.whatsapp.meta.connection_error", "Error de conexión al vincular con Meta"), { id: toastId });
    } finally {
      setLoadingMeta(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    const isScanningSession = sessions.find((s) => s.sessionId === sessionId)?.status === "SCANNING";
    const actionText = isScanningSession ? t("integrations.whatsapp.canceling", "Cancelando vinculación...") : t("integrations.whatsapp.disconnecting", "Desconectando sesión...");
    const toastId = toast.loading(actionText);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/whatsapp/sessions/${sessionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : { status: "success" };
      } catch (e) {
        data = { status: "success" };
      }

      if (data.status === "success") {
        toast.success(isScanningSession ? t("integrations.whatsapp.canceled", "Vinculación cancelada") : t("integrations.whatsapp.disconnected_success", "Sesión desconectada exitosamente"), { id: toastId });
        setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
        if (scanningSessionId === sessionId) {
          setIsScanning(false);
          setCurrentQr(null);
          setScanningSessionId(null);
          setPairingCode(null);
        }
      } else {
        toast.error(data.message || t("common.error", "Error al procesar la solicitud"), { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error(t("integrations.whatsapp.error.disconnect", "Error al desconectar"), { id: toastId });
    }
  };

  const handleReconnectSession = async (sessionId: string) => {
    setReconnectingIds((prev) => {
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/whatsapp/sessions/${sessionId}/reconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status === "success") {
        toast.success(t("integrations.whatsapp.reconnect_sent", "Solicitud de reconexión enviada."));
        fetchSessions();
      } else {
        toast.error(data.message || t("integrations.whatsapp.error.reconnect", "Error al intentar reconectar"));
      }
    } catch (err) {
      console.error(err);
      toast.error(t("integrations.whatsapp.error.reconnect", "Error al reconectar"));
    } finally {
      setReconnectingIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  };

  const handleUpdateSessionQueue = async (sessionId: string, queueId: string | null) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/whatsapp/sessions/${sessionId}/queue`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          defaultQueueId: queueId || null,
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        toast.success(t("integrations.whatsapp.queue_updated", "Cola predeterminada actualizada"));
        setSessions((prev) =>
          prev.map((s) => (s.sessionId === sessionId ? { ...s, defaultQueueId: queueId } : s))
        );
      } else {
        toast.error(data.message || t("integrations.whatsapp.error.queue", "Error al actualizar cola"));
      }
    } catch (err) {
      console.error(err);
      toast.error(t("integrations.whatsapp.error.queue_connection", "Error al actualizar la cola predeterminada"));
    }
  };

  const handleUpdateProfileName = async (sessionId: string, name: string) => {
    const toastId = toast.loading(t("integrations.whatsapp.profile.updating", "Actualizando nombre de perfil..."));
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/whatsapp/sessions/${sessionId}/profile-name`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.status === "success") {
        toast.success(t("integrations.whatsapp.profile.updated_success", "Nombre de perfil de WhatsApp actualizado exitosamente"), { id: toastId });
        setSessions((prev) =>
          prev.map((s) => (s.sessionId === sessionId ? { ...s, profileName: name } : s))
        );
      } else {
        toast.error(data.message || t("integrations.whatsapp.profile.error", "Error al actualizar el nombre"), { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error(t("integrations.whatsapp.profile.connection_error", "Error de conexión al actualizar el nombre de perfil"), { id: toastId });
    }
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
              {sessions.length} {sessions.length === 1 ? t("integrations.whatsapp.one_number", "número") : t("integrations.whatsapp.many_numbers", "números")}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t("integrations.whatsapp.description", "Conecta tu WhatsApp vía Web (Código QR) o API Oficial.")}
          </p>
        </div>
      </div>

      <div className="h-px bg-gray-100 dark:bg-reply-border-dark my-6" />

      {error && (
        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3">
          <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h4 className="font-bold text-red-800 dark:text-red-300 text-sm">{t("common.error.connection_title", "Error de Conexión")}</h4>
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
          <button
            onClick={fetchSessions}
            className="ml-auto bg-red-100 dark:bg-red-800/40 text-red-800 dark:text-red-300 px-3 py-1 rounded-lg text-xs font-bold hover:bg-red-200 dark:hover:bg-red-800/60"
          >
            {t("common.retry", "Reintentar")}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {sessions.map((session) => (
          <div
            key={session.sessionId}
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
                  <div className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white dark:border-[#202c33] shadow-sm z-10">
                    {sessions.findIndex((s) => s.sessionId === session.sessionId) + 1}
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
                  ? t("integrations.whatsapp.waiting_scan", "⏳ Esperando escaneo...")
                  : session.status === "DISCONNECTED"
                    ? t("integrations.whatsapp.disconnected_desc", "🔴 Sesión desconectada")
                    : session.status === "FAILED"
                      ? t("integrations.whatsapp.failed_desc", "⚠️ Conexión fallida")
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
                  onChange={(e) => handleUpdateSessionQueue(session.sessionId, e.target.value)}
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
                      value={profileNameDrafts[session.sessionId] ?? ""}
                      onChange={(e) =>
                        setProfileNameDrafts((prev) => ({ ...prev, [session.sessionId]: e.target.value }))
                      }
                      className="flex-1 text-xs p-2 rounded-lg border border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                    />
                    <button
                      onClick={() => handleUpdateProfileName(session.sessionId, profileNameDrafts[session.sessionId] || "")}
                      disabled={!profileNameDrafts[session.sessionId]?.trim()}
                      className="px-3 py-2 text-xs font-semibold text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors border border-green-100 dark:border-green-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {t("common.save", "Guardar")}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-reply-border-dark">
                <button
                  onClick={() => handleDeleteSession(session.sessionId)}
                  className="flex-1 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-transparent hover:border-red-100 dark:hover:border-red-900/30"
                >
                  {session.status === "SCANNING" ? t("common.cancel", "Cancelar") : t("common.disconnect", "Desconectar")}
                </button>
                {(session.status === "DISCONNECTED" || session.status === "FAILED") && (
                  <button
                    disabled={reconnectingIds.has(session.sessionId)}
                    onClick={() => handleReconnectSession(session.sessionId)}
                    className="flex-1 px-3 py-2 text-xs font-semibold text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors border border-transparent hover:border-green-100 dark:hover:border-green-900/30 flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    {reconnectingIds.has(session.sessionId) ? (
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
                    onClick={() => {
                      setCurrentQr(session.qrCode);
                      setScanningSessionId(session.sessionId);
                      setIsScanning(true);
                    }}
                    className="flex-1 px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors border border-transparent hover:border-blue-100 dark:hover:border-blue-900/30"
                  >
                    {t("integrations.whatsapp.view_qr", "Ver QR")}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={() => {
            setConnectionMethod(reviewModeActive ? "meta" : "qr");
            setPairingCode(null);
            setCurrentQr(null);
            setIsScanning(true);
          }}
          disabled={loading}
          className="group flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-gray-200 dark:border-reply-border-dark hover:border-blue-400 dark:hover:border-blue-500/50 bg-reply-bg/50 dark:bg-reply-surface-dark hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all duration-300 h-full min-h-[220px]"
        >
          <div className="w-14 h-14 rounded-full bg-white dark:bg-gray-800 shadow-sm group-hover:shadow-md group-hover:scale-110 transition-all duration-300 flex items-center justify-center mb-4 text-blue-500">
            {loading ? (
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

      {isScanning && (
        <div className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-[#111827] rounded-3xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto custom-scrollbar border border-gray-100 dark:border-gray-800 flex flex-col md:flex-row relative md:min-h-[350px]">
            <button
              onClick={() => {
                setIsScanning(false);
                setCurrentQr(null);
                setScanningSessionId(null);
                setPairingCode(null);
                setPairingPhone("");
                setConnectionMethod("qr");
              }}
              className="absolute top-4 right-4 z-50 text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors bg-white/10 rounded-full p-1 scroll-m-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {!currentQr && !pairingCode && !loading && !loadingPairingCode ? (
              <div className="flex-1 p-6 sm:p-8 flex flex-col justify-center bg-white dark:bg-[#111827]">
                <div className="mb-6 text-center">
                  <h3
                    onClick={() => {
                      const nextCount = reviewClickCount + 1;
                      if (nextCount >= 5) {
                        const nextState = !reviewModeActive;
                        setReviewModeActive(nextState);
                        setConnectionMethod(nextState ? "meta" : "qr");
                        localStorage.setItem("isReviewMode", nextState ? "true" : "false");
                        toast.success(nextState ? "Modo Auditoría Activado" : "Modo Auditoría Desactivado");
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
                      onClick={handleCreateSession}
                      disabled={loading}
                      className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all shadow-md active:scale-95"
                    >
                      {loading ? t("common.starting", "Iniciando...") : t("integrations.whatsapp.generate_qr", "Generar Código QR")}
                    </button>
                  </div>
                )}

                {connectionMethod === "phone" && (
                  <form onSubmit={handleRequestPairingCode} className="space-y-4">
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
                  <form onSubmit={handleCreateMetaSession} className="space-y-4">
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
              <div className="flex-1 flex flex-col md:flex-row bg-white dark:bg-[#111827]">
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
              <div className="flex-1 flex flex-col md:flex-row bg-white dark:bg-[#111827]">
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
      )}

      {showUpgradeModal && (
        <Modal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          title={t("integrations.whatsapp.upgrade.title", "Límite de Canales Alcanzado")}
          subtitle={t("integrations.whatsapp.upgrade.subtitle", "Mejora tu plan para expandir tu alcance omnichannel")}
        >
          <div className="space-y-4 text-sm text-gray-600 dark:text-gray-400">
            <p>
              {t("integrations.whatsapp.upgrade.description", "Tu plan actual solo permite conectar una sola sesión activa de WhatsApp. Para vincular múltiples números, debes actualizar tu suscripción.")}
            </p>
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowUpgradeModal(false)}
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
