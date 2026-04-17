import { create } from "zustand";
import { socketService } from "@/services/socketService";

// ────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────

/** WhatsApp session status from Baileys */
export type WhatsAppSessionStatus =
  | "CONNECTED"
  | "DISCONNECTED"
  | "QR_PENDING"
  | "CONNECTING";

interface SocketState {
  // ── Connection State ──
  /** CRM WebSocket connection status (socket.io) */
  isConnected: boolean;
  /** WhatsApp session status (Baileys — separate from CRM socket) */
  whatsappStatus: WhatsAppSessionStatus;
  /** Timestamp of the last successful connection */
  lastConnectedAt: number | null;
  /** Number of reconnection attempts since last healthy connection */
  reconnectAttempts: number;

  // ── Actions ──
  /** Initialize socket connection and register lifecycle listeners */
  initialize: (userRole?: string, userId?: string, companyId?: string) => void;
  /** Tear down socket connection and all listeners */
  teardown: () => void;
  /** Join a specific socket room (agent room, company room, etc.) */
  joinRoom: (roomId: string) => void;
  /** Emit a typed event through the centralized socket */
  emit: (event: string, data: unknown) => void;
  /** Subscribe to a socket event. Returns unsubscribe function. */
  subscribe: <T = unknown>(event: string, handler: (data: T) => void) => () => void;
}

// ────────────────────────────────────────────────
// CONSTANTS
// ────────────────────────────────────────────────

/** Grace period before we report "disconnected" to the UI (ms) */
const DISCONNECT_GRACE_MS = 5_000;

/** Admin-level roles that join the company-wide room */
const ADMIN_ROLES = ["ADMIN", "SUPERVISOR", "MASTER"];

// ────────────────────────────────────────────────
// STORE
// ────────────────────────────────────────────────

/** Internal ref so the grace-period timeout survives across renders */
let disconnectTimeout: ReturnType<typeof setTimeout> | null = null;

/** Internal ref to track active subscriptions for cleanup */
const activeCleanups: Array<() => void> = [];

export const useSocketStore = create<SocketState>()((set, get) => ({
  // ── Initial State ──
  isConnected: false,
  whatsappStatus: "DISCONNECTED",
  lastConnectedAt: null,
  reconnectAttempts: 0,

  // ────────────────────────────────────────────────
  // INITIALIZE
  // ────────────────────────────────────────────────
  initialize: (userRole?: string, userId?: string, companyId?: string) => {
    // 1. Connect the raw socket
    socketService.connect();

    // 2. Immediate check (socket may already be connected from a prior init)
    if (socketService.isConnected) {
      set({ isConnected: true, lastConnectedAt: Date.now(), reconnectAttempts: 0 });
    }

    // 3. Lifecycle Listeners
    const onConnect = () => {
      // Cancel pending grace-period disconnect
      if (disconnectTimeout) {
        clearTimeout(disconnectTimeout);
        disconnectTimeout = null;
      }
      set({ isConnected: true, lastConnectedAt: Date.now(), reconnectAttempts: 0 });

      // Re-join rooms on reconnect
      if (userId) {
        socketService.emit("join_room", { conversationId: `agent:${userId}` });
      }
      if (companyId && userRole && ADMIN_ROLES.includes(userRole)) {
        socketService.emit("join_room", { conversationId: `company:${companyId}` });
      }
    };

    const onDisconnect = () => {
      // Start grace period — only report offline after DISCONNECT_GRACE_MS
      if (disconnectTimeout) clearTimeout(disconnectTimeout);
      disconnectTimeout = setTimeout(() => {
        set({ isConnected: false });
      }, DISCONNECT_GRACE_MS);

      set((s) => ({ reconnectAttempts: s.reconnectAttempts + 1 }));
    };

    // WhatsApp session events (separate concept from CRM socket)
    const onSessionStatus = (data: { sessionId: string; status: string }) => {
      const mapped = data.status as WhatsAppSessionStatus;
      set({ whatsappStatus: mapped });
    };

    const onQrUpdated = () => {
      set({ whatsappStatus: "QR_PENDING" });
    };

    socketService.on("connect", onConnect);
    socketService.on("disconnect", onDisconnect);
    socketService.on("session.status", onSessionStatus);
    socketService.on("qr.updated", onQrUpdated);

    // Track for teardown
    activeCleanups.push(
      () => socketService.off("connect", onConnect),
      () => socketService.off("disconnect", onDisconnect),
      () => socketService.off("session.status", onSessionStatus),
      () => socketService.off("qr.updated", onQrUpdated),
    );

    // 4. Join initial rooms
    if (userId) {
      socketService.emit("join_room", { conversationId: `agent:${userId}` });
    }
    if (companyId && userRole && ADMIN_ROLES.includes(userRole)) {
      socketService.emit("join_room", { conversationId: `company:${companyId}` });
    }
  },

  // ────────────────────────────────────────────────
  // TEARDOWN
  // ────────────────────────────────────────────────
  teardown: () => {
    // Flush all registered cleanups
    activeCleanups.forEach((fn) => fn());
    activeCleanups.length = 0;

    if (disconnectTimeout) {
      clearTimeout(disconnectTimeout);
      disconnectTimeout = null;
    }

    socketService.disconnect();
    set({
      isConnected: false,
      whatsappStatus: "DISCONNECTED",
      lastConnectedAt: null,
      reconnectAttempts: 0,
    });
  },

  // ────────────────────────────────────────────────
  // UTILITIES
  // ────────────────────────────────────────────────
  joinRoom: (roomId: string) => {
    socketService.emit("join_room", { conversationId: roomId });
  },

  emit: (event: string, data: unknown) => {
    socketService.emit(event, data);
  },

  subscribe: <T = unknown>(event: string, handler: (data: T) => void) => {
    socketService.on(event, handler);
    return () => socketService.off(event, handler);
  },
}));
