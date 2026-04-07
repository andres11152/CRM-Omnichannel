import { io, Socket } from "socket.io-client";
import { jwtDecode } from "jwt-decode";
import { BASE_URL } from "./apiConfig";
import { Logger } from "@/utils/logger";

const SOCKET_URL = BASE_URL;

/** [SEC] JWT Payload type (replaces `any` from jwtDecode) */
interface JwtPayload {
  id: string;
  companyId: string;
  email?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

class SocketService {
  private socket: Socket | null = null;

  get isConnected(): boolean {
    return this.socket?.connected || false;
  }

  connect() {
    if (this.socket) {
      if (!this.socket.connected) {
        const token = localStorage.getItem("token");
        if (token) {
          try {
            const decoded = jwtDecode<JwtPayload>(token);
            this.socket.auth = { token };
            if (this.socket.io?.opts?.query) {
               this.socket.io.opts.query = { agentId: decoded.id };
            }
            this.socket.connect();
          } catch (e) {
            Logger.error("[SocketService] Invalid token during reconnect", e);
          }
        }
      }
      return;
    }

    const token = localStorage.getItem("token");
    let agentId = "anonymous";

    if (token) {
      try {
        const decoded = jwtDecode<JwtPayload>(token);
        agentId = decoded.id;
      } catch (e) {
        Logger.error("[SocketService] Invalid token for socket init", e);
      }
    }

    this.socket = io(SOCKET_URL, {
      transports: ["polling", "websocket"],
      path: "/socket.io/",
      withCredentials: true,
      autoConnect: !!token, // [SEC] ONLY autoconnect if we have a token
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,

      query: { agentId },
      auth: { token },
    });

    this.socket.on("connect", () => {
      Logger.info("[SocketService] [OK] Connected to server", SOCKET_URL);
    });

    this.socket.on("disconnect", (reason) => {
      Logger.warn(`[SocketService]  Disconnected: ${reason}`);
      if (reason !== "io client disconnect") {
        import("sonner").then(({ toast }) => {
          toast.error("Desconectado del servidor. Intentando reconectar...");
        });
      }
    });

    this.socket.on("reconnect", (attemptNumber) => {
      Logger.info(`[SocketService] [SYNC] Reconnected (attempt ${attemptNumber})`);
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
      Logger.warn(`[SocketService] [WARNING] Connection Error: ${err.message}`);
    });
  }

  disconnect() {
    if (this.socket) {
      Logger.info("[SocketService]  Disconnecting socket");
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on<T = unknown>(event: string, callback: (data: T) => void) {
    if (!this.socket) this.connect();
    this.socket?.on(event, callback as (...args: unknown[]) => void);
  }

  off<T = unknown>(event: string, callback: (data: T) => void) {
    this.socket?.off(event, callback as (...args: unknown[]) => void);
  }

  emit(event: string, data: unknown) {
    if (!this.socket) this.connect();
    this.socket?.emit(event, data);
  }

  // Convenience Wrappers for Chat
  onMessageReceived(callback: (payload: any) => void) {
    this.on("message.received", callback);
    return () => this.off("message.received", callback);
  }

  onTypingStatus(callback: (payload: { ticketId: string; isTyping: boolean }) => void) {
    this.on("typing.status", callback);
    return () => this.off("typing.status", callback);
  }
}

export const socketService = new SocketService();
