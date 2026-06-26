import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { socketService } from "@/services/socketService";
import { API_BASE_URL } from "@/services/apiConfig";
import { ModuleHeader } from "./common/ModuleHeader";
import { Logger } from "@/utils/logger";
import QRCode from "react-qr-code";
import { Sparkles } from "lucide-react";
import { Modal, ModalButton } from "./ui/Modal";

interface WhatsAppSession {
  sessionId: string;
  status: string;
  phone: string | null;
  qrCode: string | null;
  defaultQueueId?: string | null;
  createdAt: string;
}

interface Queue {
  id: string;
  name: string;
}

export const IntegrationsPanel: React.FC = () => {
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [currentQr, setCurrentQr] = useState<string | null>(null);
  const [scanningSessionId, setScanningSessionId] = useState<string | null>(
    null,
  );
  const [queues, setQueues] = useState<Queue[]>([]);
  const [reconnectingIds, setReconnectingIds] = useState<Set<string>>(new Set());

  // Phone pairing states
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingPhone, setPairingPhone] = useState("");
  const [connectionMethod, setConnectionMethod] = useState<"qr" | "phone">("qr");
  const [loadingPairingCode, setLoadingPairingCode] = useState(false);

  const fetchSessions = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/whatsapp/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status === "success") {
        // Sort sessions by creation date ASC (Oldest first -> #1)
        const sortedSessions = data.data.sessions.sort(
          (a: WhatsAppSession, b: WhatsAppSession) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        setSessions(sortedSessions);

        // [SEC] ENTERPRISE: Modal persistence logic
        const currentScanningId = scanningSessionIdRef.current;
        if (currentScanningId) {
          const activeSession = data.data.sessions.find(
            (s: WhatsAppSession) => s.sessionId === currentScanningId,
          );
          // Only close if session is GONE or fully CONNECTED
          if (!activeSession || activeSession.status === "CONNECTED") {
            setIsScanning(false);
            setCurrentQr(null);
            setScanningSessionId(null);
          } else if (activeSession.qrCode && activeSession.qrCode !== currentQrRef.current) {
            // If ID matches but QR changed, just update QR without toggling modal
            setCurrentQr(activeSession.qrCode);
          }
        }
      }
      setError(null);
    } catch (error) {
      console.error("Failed to fetch sessions", error);
      setError("No se pudo conectar con el servidor. Verifica tu conexión.");
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

  // Refs for socket listeners to avoid stale closures without re-subscribing
  const sessionsRef = useRef(sessions);
  const scanningSessionIdRef = useRef(scanningSessionId);
  const currentQrRef = useRef(currentQr);
  const isScanningRef = useRef(isScanning);

  useEffect(() => {
    sessionsRef.current = sessions;
    scanningSessionIdRef.current = scanningSessionId;
    currentQrRef.current = currentQr;
    isScanningRef.current = isScanning;
  }, [sessions, scanningSessionId, currentQr, isScanning]);

  useEffect(() => {
    fetchSessions();
    fetchQueues();

    // Socket Listeners for Real-Time Updates
    const handleQrUpdate = (data: { sessionId: string; qr: string }) => {
      console.log("QR Update Received:", data);

      const currentScanningId = scanningSessionIdRef.current;

      // Priority check: Is this the session we are waiting for?
      if (data.sessionId === currentScanningId) {
        setCurrentQr(data.qr);
        setIsScanning(true);
      }

      setSessions((prev) => {
        // Check if session exists
        const exists = prev.find((s) => s.sessionId === data.sessionId);
        if (exists) {
          return prev.map((s) => {
            if (s.sessionId === data.sessionId) {
              return { ...s, qrCode: data.qr, status: "SCANNING" };
            }
            return s;
          });
        } else {
          // If it doesn't exist (race condition fix), add it if it matches our scanning ID
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

    const handleStatusUpdate = (data: {
      sessionId: string;
      status: string;
      phone?: string;
    }) => {
      console.log("Status Update Received:", data);
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

        // [SEC] Robust Modal Closing Logic
        const isTargetSession = data.sessionId === currentScanningId;
        const matchesCurrentQr =
          currentQrVal &&
          currentSessions.find((s) => s.sessionId === data.sessionId)
            ?.qrCode === currentQrVal;

        if (isTargetSession || matchesCurrentQr) {
          Logger.info(
            `[ChatSync] Closing modal for connected session: ${data.sessionId}`,
          );
          setIsScanning(false);
          setCurrentQr(null);
          setScanningSessionId(null);

          // [OK] ENTERPRISE UX: Show success message with phone number
          const phoneDisplay = data.phone ? `+${data.phone}` : "tu dispositivo";
          toast.success(
            `WhatsApp ${phoneDisplay} vinculado`,
            {
              duration: 5000,
              icon: "",
            },
          );
        }
      }
    };

    const handlePairingCodeUpdate = (data: { sessionId: string; code: string }) => {
      console.log("Pairing Code Update Received:", data);
      const currentScanningId = scanningSessionIdRef.current;
      if (data.sessionId === currentScanningId) {
        setPairingCode(data.code);
        setIsScanning(true);
      }
    };

    socketService.on("qr.updated", handleQrUpdate);
    socketService.on("session.status", handleStatusUpdate);
    socketService.on("pairing_code.updated", handlePairingCodeUpdate);

    // Fallback Polling (Reduced frequency to 10s)
    const interval = setInterval(fetchSessions, 10000);

    return () => {
      socketService.off("qr.updated", handleQrUpdate);
      socketService.off("session.status", handleStatusUpdate);
      socketService.off("pairing_code.updated", handlePairingCodeUpdate);
      clearInterval(interval);
    };
  }, []); // Empty deps = Stable listeners!

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const handleCreateSession = async () => {
    // [SEC] GUARD: Prevent duplicate session creation
    if (loading) {
      toast.info("Conexión en progreso…");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");

      // [SEC] FIX: Use AbortController with generous timeout
      // The session init includes fetching WA version + Baileys startup
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
        // [SEC] If aborted/timeout, the session may still be initializing in the backend.
        // The QR will arrive via WebSocket. Show scanning state and wait.
        if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
          toast.info("Conectando… QR en camino", { duration: 5000 });
          setIsScanning(true);
          // Refresh to pick up the newly created session
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

        // Set scanning state IMMEDIATELY so WebSocket listeners are active
        setScanningSessionId(newSession.sessionId);
        setIsScanning(true);

        // If QR came in the HTTP response, use it
        if (newSession.qrCode) {
          setCurrentQr(newSession.qrCode);
        }

        setSessions((prev) => {
          const exists = prev.some((s) => s.sessionId === newSession.sessionId);
          return exists ? prev : [...prev, newSession];
        });

        fetchSessions();

        if (newSession.qrCode) {
          toast.success("QR generado. Escanea para conectar");
        } else {
          toast.info("Generando QR…", { duration: 3000 });
        }
      }
    } catch (error) {
      console.error("Failed to create session", error);
      toast.error("Error al crear sesión");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingPhone) {
      toast.error("Por favor ingresa un número de teléfono");
      return;
    }

    // Normalize phone number: must be digits only
    const normalizedPhone = pairingPhone.replace(/\D/g, "");
    if (normalizedPhone.length < 10) {
      toast.error("El número de teléfono es muy corto");
      return;
    }

    setLoadingPairingCode(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/whatsapp/sessions/pairing-code`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone: normalizedPhone }),
      });
      const data = await res.json();

      if (res.status === 403) {
        setShowUpgradeModal(true);
        setIsScanning(false);
        return;
      }

      if (data.status === "success" && data.data) {
        const { sessionId, code } = data.data;
        setScanningSessionId(sessionId);
        setIsScanning(true);
        if (code) {
          setPairingCode(code);
        } else {
          toast.info("Generando código de vinculación...");
        }
        fetchSessions();
      } else {
        toast.error(data.message || "Error al solicitar código de vinculación");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error de conexión");
    } finally {
      setLoadingPairingCode(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_BASE_URL}/whatsapp/sessions/${sessionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      // Remove from local state immediately
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));

      // Close modal if this was the scanning session
      if (sessionId === scanningSessionId) {
        setIsScanning(false);
        setCurrentQr(null);
        setScanningSessionId(null);
      }

      fetchSessions();
      toast.success("Dispositivo desvinculado");
    } catch (error) {
      console.error("Failed to delete session", error);
      toast.error("Error al desvincular dispositivo");
    }
  };

  const handleReconnectSession = async (sessionId: string) => {
    // Add to reconnecting Set
    setReconnectingIds((prev) => {
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });

    // Set scanningSessionId to this one so if it goes to SCANNING we automatically open/track the QR
    setScanningSessionId(sessionId);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/whatsapp/sessions/${sessionId}/reconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status === "success") {
        toast.success("Reconexión iniciada. Esperando QR…");
        await fetchSessions();
      } else {
        toast.error("Error al reconectar");
      }
    } catch (error) {
      console.error("Failed to reconnect session", error);
      toast.error("Error de conexión");
    } finally {
      // Remove from reconnecting Set
      setReconnectingIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  };

  const handleUpdateSessionQueue = async (
    sessionId: string,
    queueId: string,
  ) => {
    try {
      const token = localStorage.getItem("token");
      const newVal = queueId || null;

      // Optimistic Update
      setSessions((prev) =>
        prev.map((s) =>
          s.sessionId === sessionId ? { ...s, defaultQueueId: newVal } : s,
        ),
      );

      await fetch(`${API_BASE_URL}/whatsapp/sessions/${sessionId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ defaultQueueId: newVal }),
      });
      toast.success("Cola predeterminada asignada");
    } catch (e) {
      console.error(e);
      toast.error("Error al actualizar configuración");
      fetchSessions(); // Rollback
    }
  };

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark transition-colors duration-200">
      <ModuleHeader
        title="Integraciones & Canales"
        description="Centraliza tus comunicaciones conectando tus plataformas favoritas."
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
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        }
        gradient="from-green-600 to-teal-600 dark:from-green-800 dark:to-teal-900"
        stats={{
          label: "Canales Activos",
          value: sessions.filter((s) => s.status === "CONNECTED").length,
        }}
      />

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-7xl mx-auto space-y-10">
          {/* Active Connections Section */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                Tus Conexiones
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-bold border border-green-200 dark:border-green-800">
                {sessions.length} Activas
              </span>
            </div>

            {error && (
              <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3">
                <svg
                  className="w-6 h-6 text-red-600 dark:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div>
                  <h4 className="font-bold text-red-800 dark:text-red-300 text-sm">
                    Error de Conexión
                  </h4>
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {error}
                  </p>
                </div>
                <button
                  onClick={fetchSessions}
                  className="ml-auto bg-red-100 dark:bg-red-800/40 text-red-800 dark:text-red-300 px-3 py-1 rounded-lg text-xs font-bold hover:bg-red-200 dark:hover:bg-red-800/60"
                >
                  Reintentar
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Render Active Sessions */}
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
                          <svg
                            className="w-7 h-7 fill-current"
                            viewBox="0 0 24 24"
                          >
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                          </svg>
                        </div>
                        {/* [APP] SESSION INDEX BADGE */}
                        <div className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white dark:border-[#202c33] shadow-sm z-10">
                          {sessions.findIndex(
                            (s) => s.sessionId === session.sessionId,
                          ) + 1}
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
                          {session.status === "DISCONNECTED" ? "Desconectado" : session.status === "FAILED" ? "Fallido" : session.status}
                        </span>
                      </div>
                    </div>

                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                      WhatsApp Web
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-mono mb-4 truncate">
                      {session.status === "SCANNING"
                        ? "⏳ Esperando escaneo..."
                        : session.status === "DISCONNECTED"
                          ? "🔴 Sesión desconectada"
                          : session.status === "FAILED"
                            ? "⚠️ Conexión fallida"
                            : session.phone
                              ? `+${session.phone}`
                              : "Desconocido"}
                    </p>

                    <div className="mb-4">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                        Cola Predeterminada
                      </label>
                      <select
                        disabled={session.status !== "CONNECTED"}
                        value={session.defaultQueueId || ""}
                        onChange={(e) =>
                          handleUpdateSessionQueue(
                            session.sessionId,
                            e.target.value,
                          )
                        }
                        className="w-full text-xs p-2 rounded-lg border border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-green-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">-- Sin Cola Asignada --</option>
                        {queues.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-reply-border-dark">
                      <button
                        onClick={() => handleDeleteSession(session.sessionId)}
                        className="flex-1 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-transparent hover:border-red-100 dark:hover:border-red-900/30"
                      >
                        {session.status === "SCANNING"
                          ? "Cancelar"
                          : "Desconectar"}
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
                              Reconectando...
                            </>
                          ) : (
                            "Reconectar"
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
                          Ver QR
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Add New Button Card */}
              <button
                onClick={() => {
                  setConnectionMethod("qr");
                  setPairingCode(null);
                  setCurrentQr(null);
                  setIsScanning(true);
                }}
                disabled={loading}
                className="group flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-gray-200 dark:border-reply-border-dark hover:border-blue-400 dark:hover:border-blue-500/50 bg-reply-bg/50 dark:bg-reply-surface-dark hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all duration-300 h-full min-h-[220px]"
              >
                <div className="w-14 h-14 rounded-full bg-white dark:bg-gray-800 shadow-sm group-hover:shadow-md group-hover:scale-110 transition-all duration-300 flex items-center justify-center mb-4 text-blue-500">
                  {loading ? (
                    <svg
                      className="animate-spin w-6 h-6"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  ) : (
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  )}
                </div>
                <h3 className="text-gray-900 dark:text-white font-bold group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  Vincular Nuevo Dispositivo
                </h3>
                <p className="text-sm text-gray-500 text-center mt-1">
                  Conecta otro número de WhatsApp
                </p>
              </button>
            </div>
          </section>

          {/* Discover Section */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                Descubrir Ms Canales
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 text-xs font-bold border border-indigo-200 dark:border-indigo-800">
                Próximamente
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <IntegrationCard
                title="Instagram Checkouts"
                desc="Gestiona pedidos y DMs desde el direct."
                icon={
                  <svg
                    className="w-8 h-8"
                    viewBox="0 0 24 24"
                    fill="url(#ig-grad)"
                  >
                    <defs>
                      <linearGradient
                        id="ig-grad"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="100%"
                      >
                        <stop stopColor="#833AB4" offset="0%" />
                        <stop stopColor="#FD1D1D" offset="50%" />
                        <stop stopColor="#FCB045" offset="100%" />
                      </linearGradient>
                    </defs>
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.163 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                }
              />
              <IntegrationCard
                title="Facebook Messenger"
                desc="Sincroniza tu fanpage y automatiza respuestas."
                icon={
                  <svg
                    className="w-8 h-8 text-[#1877F2] fill-current"
                    viewBox="0 0 24 24"
                  >
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                }
              />
              <IntegrationCard
                title="Shopify / WooCommerce"
                desc="Integra tu catlogo y pedidos."
                icon={<span className="text-2xl">️</span>}
              />
            </div>
          </section>
        </div>
      </div>      {/* Scan QR / Phone Link Modal - Clean Enterprise Design */}
      {isScanning && (
        <div className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-[#111827] rounded-3xl shadow-xl w-full max-w-3xl overflow-hidden border border-gray-100 dark:border-gray-800 flex flex-col md:flex-row relative min-h-[350px]">
            {/* Close Button Absolute (Mobile Optimized) */}
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
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            {!currentQr && !pairingCode && !loading && !loadingPairingCode ? (
              /* Step 0: Choose Pairing Method */
              <div className="flex-1 p-8 flex flex-col justify-center bg-white dark:bg-[#111827]">
                <div className="mb-6 text-center">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    Vincular WhatsApp
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Elige el método de vinculación que prefieras para tu dispositivo.
                  </p>
                </div>

                <div className="flex border-b border-gray-200 dark:border-gray-800 mb-6">
                  <button
                    onClick={() => setConnectionMethod("qr")}
                    className={`flex-1 py-3 text-sm font-bold border-b-2 transition-all ${
                      connectionMethod === "qr"
                        ? "border-green-500 text-green-600 dark:text-green-400 font-bold"
                        : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                  >
                    Código QR (Recomendado)
                  </button>
                  <button
                    onClick={() => setConnectionMethod("phone")}
                    className={`flex-1 py-3 text-sm font-bold border-b-2 transition-all ${
                      connectionMethod === "phone"
                        ? "border-green-500 text-green-600 dark:text-green-400 font-bold"
                        : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                  >
                    Número de Teléfono (Enterprise)
                  </button>
                </div>

                {connectionMethod === "qr" ? (
                  <div className="text-center py-4 space-y-4">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Genera un código QR dinámico para escanear directamente con la cámara de tu WhatsApp.
                    </p>
                    <button
                      onClick={handleCreateSession}
                      className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-bold transition-all shadow-md"
                    >
                      Generar Código QR
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleRequestPairingCode} className="space-y-4 py-2">
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                        Número de WhatsApp (con Código de País)
                      </label>
                      <input
                        type="tel"
                        placeholder="Ej: 573001234567"
                        value={pairingPhone}
                        onChange={(e) => setPairingPhone(e.target.value)}
                        className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-reply-bg dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-green-500 outline-none transition-all text-sm font-mono"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-bold transition-all shadow-md"
                    >
                      Generar Código de Emparejamiento
                    </button>
                  </form>
                )}
              </div>
            ) : (
              /* Step 1: Render Connection Screen */
              <>
                {/* Left Panel: QR or Pairing Code Display */}
                <div className="w-full md:w-5/12 bg-gray-50/50 dark:bg-[#1F2937]/30 flex flex-col items-center justify-center p-8 relative border-b md:border-b-0 md:border-r border-gray-100 dark:border-gray-800">
                  <div className="relative z-10 p-4 bg-white rounded-2xl shadow-sm border border-gray-200 min-h-[233px] flex items-center justify-center w-full">
                    {loading || loadingPairingCode ? (
                      <div className="flex flex-col items-center justify-center text-center space-y-4">
                        <div className="w-12 h-12 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin"></div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-tighter">
                          Iniciando Baileys...
                        </p>
                      </div>
                    ) : currentQr ? (
                      <QRCode
                        value={currentQr}
                        size={200}
                        style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                        viewBox={`0 0 256 256`}
                      />
                    ) : pairingCode ? (
                      <div className="flex flex-col items-center justify-center text-center py-4">
                        <div className="text-3xl font-mono font-extrabold tracking-widest text-[#25D366] bg-slate-950 px-6 py-4 rounded-2xl border-2 border-slate-800 animate-pulse select-all shadow-inner">
                          {pairingCode}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-4 uppercase tracking-wider font-bold">
                          Haz clic para seleccionar el código
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-center space-y-4">
                        <div className="w-12 h-12 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin"></div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-tighter">
                          Generando código...
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-8 text-center space-y-2 z-10">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium text-sm">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                      </span>
                      {currentQr || pairingCode ? "Esperando conexión..." : "Iniciando Baileys..."}
                    </div>
                  </div>
                </div>

                {/* Right Panel: Instructions */}
                <div className="flex-1 p-6 md:p-8 flex flex-col justify-center relative bg-white/80 dark:bg-transparent backdrop-blur-sm">
                  <div className="mb-6 text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-3 mb-1">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#25D366] to-[#128C7E] flex items-center justify-center shadow-lg shadow-green-500/20">
                        <svg
                          className="w-5 h-5 text-white fill-current"
                          viewBox="0 0 24 24"
                        >
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                        Conectar WhatsApp
                      </h3>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {currentQr ? (
                      [
                        {
                          title: "Abre WhatsApp",
                          desc: "Configuración > Dispositivos Vinculados",
                        },
                        {
                          title: "Toca 'Vincular'",
                          desc: "Usa tu huella o FaceID si te lo pide",
                        },
                        {
                          title: "Escanea el QR",
                          desc: "Apunta la cámara al código",
                        },
                      ].map((step, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/50 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all cursor-default"
                        >
                          <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center font-bold text-xs">
                            {i + 1}
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-800 dark:text-white text-xs">
                              {step.title}
                            </h4>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400">
                              {step.desc}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      [
                        {
                          title: "Abre WhatsApp",
                          desc: "Configuración > Dispositivos Vinculados",
                        },
                        {
                          title: "Toca 'Vincular un dispositivo'",
                          desc: "Usa tu huella o FaceID si te lo pide",
                        },
                        {
                          title: "Vincular con número",
                          desc: "Toca 'Vincular con el número de teléfono en su lugar' en la parte inferior",
                        },
                        {
                          title: "Ingresa el código",
                          desc: "Escribe el código de 8 dígitos que se muestra a la izquierda",
                        },
                      ].map((step, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/50 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all cursor-default"
                        >
                          <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center font-bold text-xs">
                            {i + 1}
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-800 dark:text-white text-xs">
                              {step.title}
                            </h4>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400">
                              {step.desc}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                    <button
                      onClick={() => {
                        setIsScanning(false);
                        setCurrentQr(null);
                        setScanningSessionId(null);
                        setPairingCode(null);
                        setPairingPhone("");
                        setConnectionMethod("qr");
                      }}
                      className="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      <Modal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        size="md"
        hideCloseButton
        footer={
          <div className="w-full space-y-3">
            <ModalButton variant="primary" className="w-full" onClick={() => setShowUpgradeModal(false)}>
              Ver Planes & Precios
            </ModalButton>
            <ModalButton variant="secondary" className="w-full" onClick={() => setShowUpgradeModal(false)}>
              Quizás más tarde
            </ModalButton>
          </div>
        }
      >
        <div className="text-center py-2">
          <div className="w-20 h-20 bg-gradient-to-br from-yellow-100 to-amber-200 dark:from-yellow-900/40 dark:to-amber-900/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
            <Sparkles className="w-10 h-10 text-yellow-600 dark:text-yellow-400" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            Desbloquea Todo el Potencial
          </h3>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
            Tu plan actual ha alcanzado el límite de conexiones. Actualiza a{" "}
            <span className="font-bold text-indigo-600 dark:text-indigo-400">Pro</span>{" "}
            para conectar múltiples números y canales ilimitados.
          </p>
        </div>
      </Modal>
    </div>
  );
};

const IntegrationCard = ({
  title,
  desc,
  icon,
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
}) => (
  <div className="bg-white dark:bg-reply-panel-dark rounded-2xl border border-gray-200 dark:border-reply-border-dark p-6 flex items-start gap-4 opacity-75 grayscale hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer hover:shadow-md">
    <div className="w-12 h-12 rounded-xl bg-reply-bg dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
      {icon}
    </div>
    <div>
      <h3 className="font-bold text-gray-800 dark:text-white text-base">
        {title}
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-snug">
        {desc}
      </p>
      <button className="mt-3 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
        Conectar
      </button>
    </div>
  </div>
);
