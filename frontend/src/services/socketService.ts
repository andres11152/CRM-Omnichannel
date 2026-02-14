import { io, Socket } from "socket.io-client";
import { jwtDecode } from "jwt-decode";
import { Message } from "@/types";
import { BASE_URL } from "./apiConfig";

const SOCKET_URL = BASE_URL;

class SocketService {
  private socket: Socket | null = null;

  get isConnected(): boolean {
    return this.socket?.connected || false;
  }

  connect() {
    if (this.socket) return;

    const token = localStorage.getItem("token");
    let agentId = "anonymous";
    let companyId: string | null = null;

    if (token) {
      try {
        const decoded: any = jwtDecode(token);
        agentId = decoded.id;
        companyId = decoded.companyId;
      } catch (e) {
        console.error("Invalid token for socket", e);
      }
    }

    this.socket = io(SOCKET_URL, {
      transports: ["polling", "websocket"], // Start with polling, upgrade to websocket (matches backend)
      path: "/socket.io/",
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,

      query: { agentId },
      auth: { token }, // 🛡️ CRITICAL: Send JWT for handshake auth
    });

    this.socket.on("connect", () => {
      console.log("[Socket] Connected to", SOCKET_URL);
    });

    this.socket.on("disconnect", (reason) => {
      console.log("[Socket] Disconnected:", reason);
      if (reason !== "io client disconnect") {
        import("sonner").then(({ toast }) => {
          toast.error("Desconectado del servidor. Intentando reconectar...");
        });
      }
    });

    this.socket.on("reconnect", (attemptNumber) => {
      import("sonner").then(({ toast }) => {
        toast.success(`Reconectado exitosamente (Intento ${attemptNumber})`);
      });
    });

    this.socket.on("connect_error", (err) => {
      // Silence expected connection errors during development/restarts
      if (
        err.message.includes("xhr poll error") ||
        err.message.includes("polling")
      ) {
        return;
      }
      console.warn("[Socket] Connection Error:", err.message);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on(event: string, callback: (data: any) => void) {
    if (!this.socket) this.connect();
    //console.log(`[SocketService] Registering listener for event: ${event}`);
    this.socket?.on(event, callback);
  }

  off(event: string, callback: (data: any) => void) {
    this.socket?.off(event, callback);
  }

  emit(event: string, data: any) {
    if (!this.socket) this.connect();
    this.socket?.emit(event, data);
  }
}

export const socketService = new SocketService();
