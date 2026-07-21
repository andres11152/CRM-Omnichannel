import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { socketService } from "@/services/socketService";
import { API_BASE_URL } from "@/services/apiConfig";
import { Logger } from "@/utils/logger";
import { WhatsAppSession, Queue } from "./types";

/**
 * Owns the entire WhatsApp session-connection state machine: session list +
 * live socket updates (QR refresh, status changes, pairing codes), the three
 * connection flows (QR scan / phone pairing code / Meta Cloud API), and the
 * per-session actions (delete, reconnect, queue assignment, profile name).
 */
export function useWhatsAppSessions() {
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
    reviewModeActive ? "meta" : "qr",
  );
  const [loadingPairingCode, setLoadingPairingCode] = useState(false);

  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState("");
  const [metaBusinessId, setMetaBusinessId] = useState("");
  const [metaVerifyToken, setMetaVerifyToken] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(false);

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      } catch {
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
          prev.map((s) => (s.sessionId === sessionId ? { ...s, defaultQueueId: queueId } : s)),
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
          prev.map((s) => (s.sessionId === sessionId ? { ...s, profileName: name } : s)),
        );
      } else {
        toast.error(data.message || t("integrations.whatsapp.profile.error", "Error al actualizar el nombre"), { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error(t("integrations.whatsapp.profile.connection_error", "Error de conexión al actualizar el nombre de perfil"), { id: toastId });
    }
  };

  return {
    sessions,
    loading,
    error,
    isScanning,
    setIsScanning,
    currentQr,
    setCurrentQr,
    scanningSessionId,
    setScanningSessionId,
    queues,
    reconnectingIds,
    profileNameDrafts,
    setProfileNameDrafts,
    reviewModeActive,
    setReviewModeActive,
    reviewClickCount,
    setReviewClickCount,
    pairingCode,
    setPairingCode,
    pairingPhone,
    setPairingPhone,
    connectionMethod,
    setConnectionMethod,
    loadingPairingCode,
    metaAccessToken,
    setMetaAccessToken,
    metaPhoneNumberId,
    setMetaPhoneNumberId,
    metaBusinessId,
    setMetaBusinessId,
    metaVerifyToken,
    loadingMeta,
    showUpgradeModal,
    setShowUpgradeModal,
    fetchSessions,
    handleCreateSession,
    handleRequestPairingCode,
    handleCreateMetaSession,
    handleDeleteSession,
    handleReconnectSession,
    handleUpdateSessionQueue,
    handleUpdateProfileName,
  };
}
