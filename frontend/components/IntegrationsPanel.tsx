import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { socketService } from "../services/socketService";
import { API_BASE_URL } from "../services/apiConfig";
import { ModuleHeader } from "./common/ModuleHeader";
import QRCode from "react-qr-code";

interface WhatsAppSession {
  sessionId: string;
  status: string;
  phone: string | null;
  qrCode: string | null;
  defaultQueueId?: string | null;
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

  const fetchSessions = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/whatsapp/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status === "success") {
        setSessions(data.data.sessions);

        // Update local state if we are currently viewing a QR that has changed
        if (isScanning && currentQr) {
          const scanningSession = data.data.sessions.find(
            (s: WhatsAppSession) => s.qrCode === currentQr,
          );
          // If the session we are watching is no longer scanning (e.g. connected or deleted), close the modal
          if (!scanningSession || scanningSession.status !== "SCANNING") {
            setIsScanning(false);
            setCurrentQr(null);
            setScanningSessionId(null);
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
      setSessions((prev) =>
        prev.map((s) => {
          if (s.sessionId !== data.sessionId) return s;
          return {
            ...s,
            status: data.status,
            phone: data.phone || s.phone,
            qrCode: data.status === "CONNECTED" ? null : s.qrCode,
          };
        }),
      );

      if (data.status === "CONNECTED") {
        const currentScanningId = scanningSessionIdRef.current;
        const currentQrVal = currentQrRef.current;
        const currentSessions = sessionsRef.current;

        // Close modal if open for this session
        if (
          data.sessionId === currentScanningId ||
          (currentQrVal &&
            currentSessions.find((s) => s.sessionId === data.sessionId)
              ?.qrCode === currentQrVal)
        ) {
          setIsScanning(false);
          setCurrentQr(null);
          setScanningSessionId(null);

          // ✅ ENTERPRISE UX: Show success message with phone number
          const phoneDisplay = data.phone ? `+${data.phone}` : "tu dispositivo";
          toast.success(
            `✅ ¡Conectado exitosamente! WhatsApp ${phoneDisplay} vinculado correctamente.`,
            {
              duration: 5000,
              icon: "🎉",
            },
          );
        }
      }
    };

    socketService.on("qr.updated", handleQrUpdate);
    socketService.on("session.status", handleStatusUpdate);

    // Fallback Polling (Reduced frequency to 10s)
    const interval = setInterval(fetchSessions, 10000);

    return () => {
      socketService.off("qr.updated", handleQrUpdate);
      socketService.off("session.status", handleStatusUpdate);
      clearInterval(interval);
    };
  }, []); // Empty deps = Stable listeners!

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const handleCreateSession = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/whatsapp/sessions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (res.status === 403) {
        setShowUpgradeModal(true);
        return;
      }

      if (data.status === "success" && data.data.session) {
        const newSession = data.data.session;

        // ✅ FIX: Set QR code from API response
        if (newSession.qrCode) {
          setCurrentQr(newSession.qrCode);
          setIsScanning(true);
        }

        setSessions((prev) => [...prev, newSession]);
        setScanningSessionId(newSession.sessionId);

        // ✅ AUTO-CLEANUP: Delete session if still SCANNING after 2 minutes
        setTimeout(async () => {
          const stillScanning = sessions.find(
            (s) =>
              s.sessionId === newSession.sessionId && s.status === "SCANNING",
          );
          if (stillScanning) {
            console.log(
              `[⚠️ ] Session ${newSession.sessionId} timed out, deleting...`,
            );
            await handleDeleteSession(newSession.sessionId);
            toast.error("Tiempo de escaneo agotado. Intenta de nuevo.");
          }
        }, 120000); // 2 minutes

        fetchSessions();

        // Show success message
        if (newSession.qrCode) {
          toast.success("✅ QR generado! Escanea para conectar");
        }
      }
    } catch (error) {
      console.error("Failed to create session", error);
      toast.error("Error al crear sesión.");
    } finally {
      setLoading(false);
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
      toast.success("✅ Dispositivo desvinculado correctamente");
    } catch (error) {
      console.error("Failed to delete session", error);
      toast.error("Error al desvincular dispositivo");
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
    <div className="h-full flex flex-col bg-gray-50 dark:bg-[#0b141a] transition-colors duration-200">
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
                  className={`group bg-white dark:bg-[#202c33] rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden ${session.status === "SCANNING" ? "ring-2 ring-yellow-400/50 dark:ring-yellow-500/30" : ""}`}
                >
                  <div
                    className={`absolute top-0 left-0 w-full h-1 ${session.status === "CONNECTED" ? "bg-gradient-to-r from-green-400 to-green-600" : "bg-gradient-to-r from-yellow-400 to-amber-500 animate-pulse"}`}
                  ></div>
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center text-green-600 dark:text-green-400">
                        <svg
                          className="w-7 h-7 fill-current"
                          viewBox="0 0 24 24"
                        >
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                      </div>
                      <div className="px-2.5 py-1 rounded-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center gap-2 shadow-sm">
                        <div
                          className={`w-2 h-2 rounded-full ${session.status === "CONNECTED" ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-yellow-500"}`}
                        ></div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          {session.status}
                        </span>
                      </div>
                    </div>

                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                      WhatsApp Web
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-mono mb-4 truncate">
                      {session.status === "SCANNING"
                        ? "⏳ Esperando escaneo..."
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
                        className="w-full text-xs p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-green-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">
                          -- Automática (IA / Default) --
                        </option>
                        {queues.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                      <button
                        onClick={() => handleDeleteSession(session.sessionId)}
                        className="flex-1 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-transparent hover:border-red-100 dark:hover:border-red-900/30"
                      >
                        {session.status === "SCANNING"
                          ? "Cancelar"
                          : "Desconectar"}
                      </button>
                      {session.status === "SCANNING" && session.qrCode && (
                        <button
                          onClick={() => {
                            setCurrentQr(session.qrCode);
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
                onClick={handleCreateSession}
                disabled={loading}
                className="group flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500/50 bg-gray-50/50 dark:bg-[#111b21] hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all duration-300 h-full min-h-[220px]"
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
                Descubrir Más Canales
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
                desc="Integra tu catálogo y pedidos."
                icon={<span className="text-2xl">🛍️</span>}
              />
            </div>
          </section>
        </div>
      </div>

      {/* Scan QR Modal */}
      {isScanning && currentQr && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-[#202c33] rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-gray-200 dark:border-gray-700 transform transition-all scale-100">
            <div className="bg-[#25D366] p-6 text-center relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="text-2xl font-bold text-white mb-2">
                  Vincular Dispositivo
                </h3>
                <p className="text-green-50 text-sm">
                  Escanea el código con tu celular para conectar.
                </p>
              </div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full -ml-8 -mb-8 blur-xl"></div>
            </div>

            <div className="p-8">
              <div className="flex flex-col md:flex-row items-center md:items-start gap-10">
                {/* QR Section */}
                <div className="flex-shrink-0">
                  <div className="relative group">
                    <div className="w-[280px] h-[280px] bg-white p-3 rounded-xl shadow-lg border-2 border-dashed border-gray-200 flex items-center justify-center">
                      <QRCode
                        value={currentQr}
                        size={256}
                        style={{
                          height: "auto",
                          maxWidth: "100%",
                          width: "100%",
                        }}
                        viewBox={`0 0 256 256`}
                      />
                    </div>
                    <div className="absolute -inset-2 border-2 border-[#25D366]/30 rounded-2xl animate-pulse pointer-events-none"></div>
                  </div>
                </div>

                {/* Instructions Section */}
                <div className="flex-1 w-full flex flex-col justify-center">
                  <h4 className="text-lg font-bold text-gray-800 dark:text-white mb-4 hidden md:block">
                    Instrucciones
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                      <span className="flex-shrink-0 w-8 h-8 bg-[#25D366] text-white rounded-full flex items-center justify-center font-bold">
                        1
                      </span>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                        Abre WhatsApp en tu teléfono y ve a{" "}
                        <span className="font-bold text-gray-800 dark:text-white">
                          Ajustes
                        </span>{" "}
                        o{" "}
                        <span className="font-bold text-gray-800 dark:text-white">
                          Configuración
                        </span>
                        .
                      </p>
                    </div>
                    <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                      <span className="flex-shrink-0 w-8 h-8 bg-[#25D366] text-white rounded-full flex items-center justify-center font-bold">
                        2
                      </span>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                        Toca en{" "}
                        <span className="font-bold text-gray-800 dark:text-white">
                          Dispositivos Vinculados
                        </span>{" "}
                        y luego en{" "}
                        <span className="font-bold text-gray-800 dark:text-white">
                          Vincular un dispositivo
                        </span>
                        .
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 flex justify-end">
                    <button
                      onClick={() => setIsScanning(false)}
                      className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white font-medium transition-colors px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                    >
                      Cancelar y cerrar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#202c33] rounded-2xl shadow-2xl max-w-md w-full p-8 animate-fade-in border border-gray-200 dark:border-gray-700">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-yellow-100 to-amber-200 dark:from-yellow-900/40 dark:to-amber-900/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                <svg
                  className="w-10 h-10 text-yellow-600 dark:text-yellow-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                Desbloquea Todo el Potencial
              </h3>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                Tu plan actual ha alcanzado el límite de conexiones. Actualiza a{" "}
                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                  Pro
                </span>{" "}
                para conectar múltiples números y canales ilimitados.
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
              >
                Ver Planes & Precios
              </button>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="w-full py-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-medium transition-colors"
              >
                Quizás más tarde
              </button>
            </div>
          </div>
        </div>
      )}
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
  <div className="bg-white dark:bg-[#202c33] rounded-2xl border border-gray-200 dark:border-gray-700 p-6 flex items-start gap-4 opacity-75 grayscale hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer hover:shadow-md">
    <div className="w-12 h-12 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
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
